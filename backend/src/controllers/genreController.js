import * as genreService from '../services/genreService.js';

export const updateGenres = async (req, res) => {
  const email = req.user.email;
  const { genres, subGenres, updatedAt, location, date, searchMode } = req.body;

  if (!email || (searchMode !== 'all_history' && subGenres == null)) {
    return res.status(400).json({ message: 'Missing genres or subGenres' });
  }

  try {
    const finalEvents = await genreService.updateGenresAndFindEvents({
      email,
      genres,
      subGenres,
      updatedAt,
      location,
      date,
      searchMode,
    });

    return res.json(finalEvents);
  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({ message: 'User not found' });
    }
    if (error.message === 'INVALID_SUBGENRES_STRUCTURE') {
      return res.status(400).json({
        message: 'A subgenres object with category filters is required in the request body.',
      });
    }

    console.error('Update failed:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
