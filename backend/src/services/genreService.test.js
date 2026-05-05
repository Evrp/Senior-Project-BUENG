/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';

const mockFilter = {
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
};

const mockEvent = {
  find: jest.fn(),
};

const mockInfoMatch = {
  find: jest.fn(),
};

const mockGmail = {
  findOne: jest.fn(),
};

const mockEventService = {
  buildGenreConditions: jest.fn((subGenres, genreField = 'genre') =>
    Object.entries(subGenres).map(([category, values]) =>
      Array.isArray(values) && values.length > 0
        ? { [`${genreField}.${category}`]: { $in: values } }
        : { [`${genreField}.${category}`]: { $exists: true } }
    )
  ),
  getUserEventsForPreferences: jest.fn(),
  linkExistingEventsToUser: jest.fn(),
  normalizeSubGenres: jest.fn((subGenres) => {
    if (Array.isArray(subGenres)) return { 'All Categories': subGenres };
    if (subGenres instanceof Map) return Object.fromEntries(subGenres.entries());
    return subGenres || {};
  }),
  saveEventsFromSource: jest.fn(),
};

const mockSerpApiService = {
  searchEvents: jest.fn(),
};

jest.unstable_mockModule('../model/filter.js', () => ({ Filter: mockFilter }));
jest.unstable_mockModule('../model/event.js', () => ({ Event: mockEvent }));
jest.unstable_mockModule('../model/infomatch.js', () => ({ InfoMatch: mockInfoMatch }));
jest.unstable_mockModule('../model/gmail.js', () => ({ Gmail: mockGmail }));
jest.unstable_mockModule('./eventService.js', () => mockEventService);
jest.unstable_mockModule('./serpApiService.js', () => mockSerpApiService);

const { updateGenresAndFindEvents } = await import('./genreService.js');

const mockSelectResult = (result) => ({
  select: jest.fn().mockResolvedValue(result),
});

const mockEventFindResults = (...results) => {
  mockEvent.find.mockImplementation(() => {
    const result = results.length > 0 ? results.shift() : [];
    return {
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(result),
        }),
      }),
    };
  });
};

describe('genreService.updateGenresAndFindEvents', () => {
  const email = 'user@bumail.net';

  beforeEach(() => {
    jest.clearAllMocks();
    mockGmail.findOne.mockResolvedValue({ email });
    mockInfoMatch.find.mockReturnValue(mockSelectResult([]));
    mockEventService.linkExistingEventsToUser.mockResolvedValue([]);
    mockEventService.saveEventsFromSource.mockResolvedValue([]);
    mockEventService.getUserEventsForPreferences.mockResolvedValue({ events: [] });
    mockSerpApiService.searchEvents.mockResolvedValue([]);
  });

  it('searches every selected subgenre independently and calls SerpApi only for the missing one', async () => {
    const subGenres = { 'All Categories': ['Music', 'Yoga'] };
    const musicEvent = {
      _id: 'event_music',
      title: 'Music Night',
      link: 'https://example.com/music',
    };
    const canonicalEvents = [
      { _id: 'event_music', title: 'Music Night', genre: { 'All Categories': ['Music'] } },
      { _id: 'event_yoga', title: 'Yoga Session', genre: { 'All Categories': ['Yoga'] } },
    ];

    mockFilter.findOne.mockResolvedValue({ email, subGenres });
    mockEventFindResults([musicEvent], []);
    mockSerpApiService.searchEvents.mockResolvedValue([
      { title: 'Yoga Session', link: 'https://example.com/yoga' },
    ]);
    mockEventService.getUserEventsForPreferences.mockResolvedValue({ events: canonicalEvents });

    const result = await updateGenresAndFindEvents({
      email,
      genres: ['All Categories'],
      subGenres,
    });

    expect(mockEvent.find).toHaveBeenCalledTimes(2);
    expect(mockEvent.find.mock.calls[0][0].$and).toContainEqual({
      'genre.All Categories': { $in: ['Music'] },
    });
    expect(mockEvent.find.mock.calls[1][0].$and).toContainEqual({
      'genre.All Categories': { $in: ['Yoga'] },
    });
    expect(mockEventService.linkExistingEventsToUser).toHaveBeenCalledWith({
      email,
      events: [musicEvent],
    });
    expect(mockSerpApiService.searchEvents).toHaveBeenCalledWith(
      expect.stringContaining('Yoga'),
      undefined
    );
    expect(mockEventService.saveEventsFromSource).toHaveBeenCalledWith({
      data: [{ title: 'Yoga Session', link: 'https://example.com/yoga' }],
      email,
      subGenres: { 'All Categories': ['Yoga'] },
    });
    expect(result).toEqual(canonicalEvents);
  });

  it('normalizes legacy array subGenres before saving the user filter', async () => {
    const normalizedSubGenres = { 'All Categories': ['Music'] };
    mockFilter.findOne.mockResolvedValue({ email, subGenres: normalizedSubGenres });
    mockEventFindResults([]);

    await updateGenresAndFindEvents({
      email,
      subGenres: ['Music'],
    });

    expect(mockFilter.findOneAndUpdate).toHaveBeenCalledWith(
      { email },
      {
        genres: ['All Categories'],
        subGenres: normalizedSubGenres,
      },
      { new: true, upsert: true }
    );
  });
});
