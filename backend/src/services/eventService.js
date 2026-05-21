import { Event } from '../model/event.js';
import { UserEvent } from '../model/userevent.model.js';
import { Info } from '../model/info.js';
import { Filter } from '../model/filter.js';
import { getModel } from './gemini.js';

const DEFAULT_GENRE_CATEGORY = 'All Categories';

export const normalizeSubGenres = (subGenres) => {
  if (!subGenres) return {};

  if (Array.isArray(subGenres)) {
    const values = [
      ...new Set(
        subGenres
          .filter((value) => value != null)
          .map((value) => String(value).trim())
          .filter(Boolean)
      ),
    ];
    return values.length > 0 ? { [DEFAULT_GENRE_CATEGORY]: values } : {};
  }

  if (typeof subGenres !== 'object' && !(subGenres instanceof Map)) {
    return {};
  }

  const entries =
    subGenres instanceof Map ? Array.from(subGenres.entries()) : Object.entries(subGenres);

  return entries.reduce((acc, [category, values]) => {
    const cleanCategory = String(category).trim();
    if (!cleanCategory) return acc;

    const valuesArray = Array.isArray(values) ? values : values == null ? [] : [values];
    acc[cleanCategory] = [
      ...new Set(
        valuesArray
          .filter((value) => value != null)
          .map((value) => String(value).trim())
          .filter(Boolean)
      ),
    ];
    return acc;
  }, {});
};

export const buildGenreConditions = (subGenres, genreField = 'genre') => {
  const normalizedSubGenres = normalizeSubGenres(subGenres);

  return Object.entries(normalizedSubGenres)
    .map(([category, subgenreList]) => {
      const trimmedCategory = category.trim();
      if (!trimmedCategory) return null;

      if (!Array.isArray(subgenreList) || subgenreList.length === 0) {
        return { [`${genreField}.${trimmedCategory}`]: { $exists: true } };
      }

      const exactCategoryCondition = {
        [`${genreField}.${trimmedCategory}`]: { $in: subgenreList },
      };

      const directArrayCondition = {
        [genreField]: { $in: subgenreList },
      };

      const genrePath = `$${genreField}`;
      const genreDocumentExpression = {
        $cond: [{ $eq: [{ $type: genrePath }, 'object'] }, genrePath, {}],
      };
      const anyCategoryCondition = {
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: { $objectToArray: genreDocumentExpression },
                  as: 'genreEntry',
                  cond: {
                    $gt: [
                      {
                        $size: {
                          $setIntersection: [
                            {
                              $cond: [
                                { $isArray: '$$genreEntry.v' },
                                '$$genreEntry.v',
                                ['$$genreEntry.v'],
                              ],
                            },
                            subgenreList,
                          ],
                        },
                      },
                      0,
                    ],
                  },
                },
              },
            },
            0,
          ],
        },
      };

      return { $or: [exactCategoryCondition, directArrayCondition, anyCategoryCondition] };
    })
    .filter(Boolean);
};

export const linkExistingEventsToUser = async ({ email, events }) => {
  if (!email || !Array.isArray(events) || events.length === 0) return [];

  const eventIds = [...new Set(events.map((event) => event?._id).filter(Boolean))];
  if (eventIds.length === 0) return [];

  const userEventOps = eventIds.map((eventId) => ({
    updateOne: {
      filter: { email, eventId },
      update: {
        $setOnInsert: {
          status: 'active',
          matchScore: 80,
          matchReason: 'แนะนำจากหมวดหมู่ความสนใจที่คุณเลือก',
        },
      },
      upsert: true,
    },
  }));

  await UserEvent.bulkWrite(userEventOps);
  return eventIds;
};

export const getUserEventsForPreferences = async ({ email, page = 1, limit = 100 }) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 100, 1);
  const skip = (pageNum - 1) * limitNum;

  const userFilter = await Filter.findOne({ email }).lean();
  const genreConditions = buildGenreConditions(userFilter?.subGenres, 'event.genre');

  const pipeline = [
    { $match: { email, status: 'active' } },
    { $sort: { matchScore: -1, updatedAt: -1 } },
    {
      $lookup: {
        from: 'events',
        localField: 'eventId',
        foreignField: '_id',
        as: 'event',
      },
    },
    { $unwind: '$event' },
  ];

  if (genreConditions.length > 0) {
    pipeline.push({ $match: { $or: genreConditions } });
  }

  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await UserEvent.aggregate(countPipeline);
  const totalEvents = countResult.length > 0 ? countResult[0].total : 0;

  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limitNum });

  const aggregatedResults = await UserEvent.aggregate(pipeline);
  const events = aggregatedResults.map((res) => ({
    ...res.event,
    matchScore: res.matchScore || 0,
    matchReason: res.matchReason || '',
  }));

  return {
    events,
    totalPages: Math.ceil(totalEvents / limitNum),
    currentPage: pageNum,
    totalEvents,
  };
};

/**
 * Parses various date formats from SerpApi into a Date object.
 * @param {any} dateInfo - The date information from source.
 * @returns {Date|null}
 */
const parseSerpDate = (dateInfo) => {
  if (!dateInfo) return null;
  if (dateInfo instanceof Date) return dateInfo;

  const currentYear = new Date().getFullYear();

  if (typeof dateInfo === 'string') {
    const d = new Date(dateInfo);
    // If year parsed as 2001 and the original string didn't have 2001, append current year
    if (!isNaN(d.getTime()) && d.getFullYear() === 2001 && !dateInfo.includes('2001')) {
      const fixedD = new Date(`${dateInfo} ${currentYear}`);
      if (!isNaN(fixedD.getTime())) return fixedD;
    }
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof dateInfo === 'object') {
    if (dateInfo.start_date) {
      // Append current year to start_date, which is usually like "May 9"
      let d = new Date(`${dateInfo.start_date} ${currentYear}`);
      if (!isNaN(d.getTime())) return d;
      
      d = new Date(dateInfo.start_date);
      if (!isNaN(d.getTime())) return d;
    }
    if (dateInfo.when) {
      // Try to parse 'when' string appending year
      let d = new Date(`${dateInfo.when} ${currentYear}`);
      if (!isNaN(d.getTime())) return d;

      d = new Date(dateInfo.when);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
};

/**
 * Saves events from a data source using bulk operations to optimize database load.
 * @param {object} params - The parameters for saving events.
 * @param {object} params.data - The raw data object containing events_results.
 * @param {string} params.email - The user's email.
 * @param {object} params.subGenres - The sub-genres for the events.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of newly created or updated events.
 */
export const saveEventsFromSource = async ({ data, email, subGenres }) => {
  try {
    if (!email) throw new Error('Email is required');
    const normalizedSubGenres = normalizeSubGenres(subGenres);
    if (Object.keys(normalizedSubGenres).length === 0) throw new Error('subGenres is required');

    const dataTransfer = data?.events_results ?? data;
    if (!Array.isArray(dataTransfer) || dataTransfer.length === 0) {
      throw new Error('Data must be a non-empty array');
    }

    const validItems = dataTransfer.filter((item) => item.title && item.link);
    if (validItems.length === 0) return [];

    // 1. Prepare Event Bulk Operations (Upsert Events)
    const eventOps = validItems.map((item) => {
      const parsedDate = parseSerpDate(item.date);
      return {
        updateOne: {
          filter: { title: item.title },
          update: {
            $set: {
              email,
              date: parsedDate,
              dateRaw: item.date,
              address: item.address,
              description: item.description,
              link: item.link,
              genre: normalizedSubGenres,
              image: item.image,
              thumbnail: item.thumbnail,
              venue: item.venue,
              ticket_info: item.ticket_info,
              event_location_map: item.event_location_map,
              createdByAI: true,
            },
          },
          upsert: true,
        },
      };
    });

    await Event.bulkWrite(eventOps);

    // 2. Fetch all event IDs for mapping
    const titles = validItems.map((item) => item.title);
    const events = await Event.find({ title: { $in: titles } })
      .select('_id title')
      .lean();
    const eventMap = new Map(events.map((e) => [e.title, e._id]));

    // 3. Prepare UserEvent Bulk Operations (Link Users to Events)
    const userEventOps = [];
    for (const item of validItems) {
      const eventId = eventMap.get(item.title);
      if (!eventId) continue;

      userEventOps.push({
        updateOne: {
          filter: { email, eventId },
          update: {
            $setOnInsert: { status: 'active' },
          },
          upsert: true,
        },
      });
    }

    if (userEventOps.length > 0) {
      await UserEvent.bulkWrite(userEventOps);
    }

    // 4. Calculate AI Compatibility Score and Matching Logic
    try {
      await calculateEventCompatibility({
        email,
        validItems,
        eventMap,
        subGenres: normalizedSubGenres,
      });
    } catch (aiError) {
      console.error('[AI Event Scoring Error]:', aiError);
    }

    // 5. Return the associated activities
    return await UserEvent.find({
      email,
      eventId: { $in: Array.from(eventMap.values()) },
    }).lean();
  } catch (error) {
    console.error('Error in saveEventsFromSource (Bulk):', error);
    throw error;
  }
};

/**
 * Assistant function to calculate event compatibility in bulk.
 */
const calculateEventCompatibility = async ({ email, validItems, eventMap, subGenres }) => {
  const userProfile = await Info.findOne({ email }).select('userInfo.detail').lean();
  const profileText = userProfile?.userInfo?.detail || '';

  if (profileText.length < 5) return;

  const eventsForAI = validItems
    .map((item) => ({
      title: item.title,
      description: item.description,
    }))
    .slice(0, 15);

  const systemPrompt = `
    Role: BUENG AI Event Curator
    Task: วิเคราะห์ความน่าสนใจของกิจกรรมเมื่อเทียบกับ "About Me" ของนักศึกษา
    Goal: ส่งคืนคะแนน Semantic Similarity (0-100) และเหตุผลสั้นๆ 
    Output as JSON only.
    Format: { "scores": [{ "title": "...", "score": 85, "reason": "เชื่อมโยงกับความชอบด้าน..." }] }
  `;

  const model = getModel('RECOMMENDATION', { systemInstruction: systemPrompt });
  const promptText = `User Profile: "${profileText}"\nEvents: ${JSON.stringify(eventsForAI)}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  });

  let rawOutput = result.response.text();
  if (rawOutput) {
    rawOutput = rawOutput.trim();
    if (rawOutput.startsWith('```')) {
      rawOutput = rawOutput.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
    }
  }

  const aiOutput = JSON.parse(rawOutput || '{}');
  const aiScoresMap = new Map((aiOutput.scores || []).map((s) => [s.title, s]));

  const finalUpdateOps = [];
  const mySubGenresArr = Object.values(subGenres).flat();

  for (const item of validItems) {
    const eventId = eventMap.get(item.title);
    if (!eventId) continue;

    const aiMatch = aiScoresMap.get(item.title);
    const aiScore = aiMatch?.score || 0;
    const aiReason = aiMatch?.reason || 'แนะนำตามความสนใจส่วนตัวของคุณ';

    // Weighted Score: 75% Pre-filtered Signal + 25% AI Semantic
    const baseSignal = mySubGenresArr.length > 0 ? 80 : 50;
    const finalScore = Math.round(baseSignal * 0.75 + aiScore * 0.25);

    finalUpdateOps.push({
      updateOne: {
        filter: { email, eventId },
        update: {
          $set: { matchScore: finalScore, matchReason: aiReason },
        },
      },
    });
  }

  if (finalUpdateOps.length > 0) {
    await UserEvent.bulkWrite(finalUpdateOps);
  }
};
