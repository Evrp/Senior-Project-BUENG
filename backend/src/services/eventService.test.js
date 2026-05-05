/**
 * @jest-environment node
 */
import { buildGenreConditions, normalizeSubGenres } from './eventService.js';

describe('eventService genre helpers', () => {
  it('normalizes legacy array subGenres into the default category', () => {
    expect(normalizeSubGenres(['Music', ' Music ', '', null])).toEqual({
      'All Categories': ['Music'],
    });
  });

  it('builds conditions that match the selected subgenre without depending on one category key', () => {
    const [condition] = buildGenreConditions({ Interests: ['Music'] }, 'event.genre');

    expect(condition.$or).toEqual(
      expect.arrayContaining([
        { 'event.genre.Interests': { $in: ['Music'] } },
        { 'event.genre': { $in: ['Music'] } },
        expect.objectContaining({ $expr: expect.any(Object) }),
      ])
    );
  });
});
