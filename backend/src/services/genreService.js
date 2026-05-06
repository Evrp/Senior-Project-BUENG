import { Filter } from '../model/filter.js';
import { Event } from '../model/event.js';
import { InfoMatch } from '../model/infomatch.js';
import { Gmail } from '../model/gmail.js';
import {
  buildGenreConditions,
  getUserEventsForPreferences,
  linkExistingEventsToUser,
  normalizeSubGenres,
  saveEventsFromSource,
} from './eventService.js';
import * as serpApiService from './serpApiService.js';

const RESPONSE_EVENT_LIMIT = 100;

// Helper to map semantic dates to Date ranges and regex-friendly patterns
const getDateRangeAndRegex = (dateVal) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const nextDay = new Date(tomorrow);
  nextDay.setDate(tomorrow.getDate() + 1);

  let range = null;
  let keywords = [];

  switch (dateVal) {
    case 'today': {
      range = { $gte: now, $lt: tomorrow };
      keywords = [/today/i];
      break;
    }
    case 'tomorrow': {
      range = { $gte: tomorrow, $lt: nextDay };
      keywords = [/tomorrow/i];
      break;
    }
    case 'week': {
      const endOfWeek = new Date(now);
      endOfWeek.setDate(now.getDate() + 7);
      range = { $gte: now, $lt: endOfWeek };
      keywords = [/this week/i, /week/i];
      break;
    }
    case 'month': {
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      range = { $gte: now, $lt: endOfMonth };
      keywords = [/this month/i];
      break;
    }
  }

  // Add month/day keywords for backup text search
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  if (dateVal === 'today') {
    keywords.push(new RegExp(`${months[now.getMonth()]} ${now.getDate()}`, 'i'));
  } else if (dateVal === 'tomorrow') {
    keywords.push(new RegExp(`${months[tomorrow.getMonth()]} ${tomorrow.getDate()}`, 'i'));
  }

  return {
    range,
    regex: keywords.length > 0 ? new RegExp(keywords.map((k) => k.source).join('|'), 'i') : null,
  };
};

const buildCommonFilters = ({ location, date }) => {
  const filterAnd = [];

  if (location) {
    const locationRegex = new RegExp(location.trim(), 'i');
    filterAnd.push({
      $or: [
        { title: locationRegex },
        { address: locationRegex },
        { 'venue.name': locationRegex },
        { description: locationRegex },
      ],
    });
  }

  if (date) {
    const { range, regex } = getDateRangeAndRegex(date);
    const dateOr = [];
    if (range) dateOr.push({ date: range });
    if (regex) {
      dateOr.push({ 'dateRaw.when': regex });
      dateOr.push({ 'dateRaw.start_display': regex });
      dateOr.push({ title: regex });
      dateOr.push({ description: regex });
    }

    if (dateOr.length > 0) {
      filterAnd.push({ $or: dateOr });
    }
  }

  return filterAnd;
};

const createSubgenreSearchTargets = (subGenres) => {
  return Object.entries(subGenres).flatMap(([category, subgenreList]) => {
    const trimmedCategory = category.trim();
    if (!trimmedCategory) return [];

    if (!Array.isArray(subgenreList) || subgenreList.length === 0) {
      return [{ category: trimmedCategory, subgenres: [] }];
    }

    return subgenreList.map((subgenre) => ({
      category: trimmedCategory,
      subgenres: [subgenre],
    }));
  });
};

const markMissingSubgenre = (missingSubGenres, category, subgenres) => {
  if (!Array.isArray(subgenres) || subgenres.length === 0) return;
  if (!missingSubGenres[category]) missingSubGenres[category] = [];

  subgenres.forEach((subgenre) => {
    if (!missingSubGenres[category].includes(subgenre)) {
      missingSubGenres[category].push(subgenre);
    }
  });
};

export const updateGenresAndFindEvents = async ({ email, genres, subGenres, location, date, searchMode }) => {
  // 1. Validation
  const emailValid = await Gmail.findOne({ email });
  if (!emailValid) {
    throw new Error('USER_NOT_FOUND');
  }

  // Handle all_history mode: return all previously searched events for this user
  if (searchMode === 'all_history') {
    const { events } = await getUserEventsForPreferences({
      email,
      page: 1,
      limit: RESPONSE_EVENT_LIMIT,
    });
    return events;
  }

  const normalizedSubGenres = normalizeSubGenres(subGenres);
  const normalizedGenres =
    Array.isArray(genres) && genres.length > 0
      ? [...new Set(genres.map((genre) => String(genre).trim()).filter(Boolean))]
      : Object.keys(normalizedSubGenres);

  // 2. Update Preferences
  await Filter.findOneAndUpdate(
    { email },
    { genres: normalizedGenres, subGenres: normalizedSubGenres },
    { new: true, upsert: true }
  );

  const user = await Filter.findOne({ email });

  // 3. Exclude Matched Events
  const matchedInfos = await InfoMatch.find({
    $or: [{ email: user.email }, { usermatch: user.email }],
  }).select('eventId');
  const matchedEventIds = matchedInfos.map((info) => info.eventId);

  // 4. Validate and Parse Subgenres
  if (!user.subGenres || (typeof user.subGenres !== 'object' && !(user.subGenres instanceof Map))) {
    throw new Error('INVALID_SUBGENRES_STRUCTURE');
  }

  const activeSubGenres = normalizeSubGenres(user.subGenres);
  const searchTargets = createSubgenreSearchTargets(activeSubGenres);
  const allFoundEvents = [];
  const missingSubGenres = {};

  // 5. Parallel Search in Database
  const searchPromises = searchTargets.map(async ({ category, subgenres: targetSubgenres }) => {
    const query = {
      email: { $ne: user.email },
      _id: { $nin: matchedEventIds },
    };

    const filterAnd = buildCommonFilters({ location, date });
    const genreConditions = buildGenreConditions({ [category]: targetSubgenres }, 'genre');
    filterAnd.push(...genreConditions);

    if (filterAnd.length > 0) {
      query.$and = filterAnd;
    }

    const events = await Event.find(query).sort({ date: 1 }).limit(50).lean();

    return { category, subgenres: targetSubgenres, events };
  });

  const results = await Promise.all(searchPromises);

  results.forEach((result) => {
    if (!result) return;
    if (result.events.length > 0) {
      allFoundEvents.push(...result.events);
    } else {
      markMissingSubgenre(missingSubGenres, result.category, result.subgenres);
    }
  });

  // 5.5 Fallback: Broad search if no category matches
  if (allFoundEvents.length === 0 && (location || date)) {
    const query = {
      email: { $ne: user.email },
      _id: { $nin: matchedEventIds },
    };

    const filterAnd = buildCommonFilters({ location, date });

    if (filterAnd.length > 0) {
      query.$and = filterAnd;
      const broadEvents = await Event.find(query).sort({ date: 1 }).limit(50).lean();
      allFoundEvents.push(...broadEvents);
    }
  }

  // 6. Deduplication
  const uniqueFoundEventsMap = new Map();
  allFoundEvents.forEach((e) => {
    if (e?._id) uniqueFoundEventsMap.set(e._id.toString(), e);
  });
  const uniqueFoundEvents = Array.from(uniqueFoundEventsMap.values());

  if (uniqueFoundEvents.length > 0) {
    await linkExistingEventsToUser({ email, events: uniqueFoundEvents });
  }

  // 7. Handle Missing Genres (Direct SerpApi Search)
  if (Object.keys(missingSubGenres).length > 0) {
    const serpSearchPromises = [];
    const maxItems = parseInt(process.env.SERP_MAX_ITEMS || '3', 10);

    for (const [category, subList] of Object.entries(missingSubGenres)) {
      const items = Array.isArray(subList) ? subList : [subList];
      const limitedItems = items.slice(0, maxItems); // Limit to avoid rate limits (configurable via env)

      for (const item of limitedItems) {
        const subGenreStr = String(item).trim();
        if (!subGenreStr) continue;

        // Construct query q as recommended: "interest in location"
        let searchQuery = subGenreStr;

        // Improve search query for broad or niche terms
        const lowerQuery = searchQuery.toLowerCase();
        if (lowerQuery === 'hangout') {
          searchQuery = 'Social Events';
        } else if (lowerQuery === 'volunteer') {
          searchQuery = 'Charity Events';
        } else if (
          lowerQuery === 'badminton' ||
          lowerQuery === 'swimming' ||
          lowerQuery === 'football'
        ) {
          searchQuery += ' Tournament';
        } else if (lowerQuery === 'shopping' || lowerQuery === 'market') {
          searchQuery += ' Sales';
        } else if (lowerQuery === 'drum' || lowerQuery === 'guitar') {
          searchQuery += ' Concert';
        } else if (
          lowerQuery === 'cafe' ||
          lowerQuery === 'workshop' ||
          lowerQuery === 'yoga' ||
          lowerQuery === 'gym'
        ) {
          // Keep as is or just add location, "Events" sometimes breaks these
        } else if (!lowerQuery.includes('event') && !lowerQuery.includes('fest')) {
          searchQuery += ' Events';
        }

        if (location) {
          searchQuery += ` in ${location.trim()}`;
        } else {
          searchQuery += ' in Thailand';
        }

        serpSearchPromises.push(
          (async () => {
            try {
              // Now passing date to searchEvents (used for htichips)
              const eventsFound = await serpApiService.searchEvents(searchQuery, date);

              if (eventsFound && eventsFound.length > 0) {
                await saveEventsFromSource({
                  data: eventsFound,
                  email: user.email,
                  subGenres: { [category]: [subGenreStr] },
                });
              }
            } catch (searchError) {
              console.error(`⚠️ SerpApi search failed for "${searchQuery}":`, searchError.message);
            }
          })()
        );
      }
    }
    await Promise.all(serpSearchPromises);
  }

  const { events } = await getUserEventsForPreferences({
    email,
    page: 1,
    limit: RESPONSE_EVENT_LIMIT,
  });

  return events;
};
