import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SERPAPI_URL = 'https://serpapi.com/search.json';
const API_KEY = process.env.SERPAPI_API_KEY;

/**
 * Common internal function to fetch data from SerpApi
 */
const fetchSerpData = async (query, dateFilter = null, start = 0) => {
  if (!API_KEY) {
    throw new Error('SERPAPI_API_KEY_MISSING');
  }

  try {
    const params = {
      engine: 'google_events',
      q: query,
      google_domain: 'google.co.th',
      htichips: dateFilter ? `date:${dateFilter}` : 'date:week',
      api_key: API_KEY,
    };

    if (start > 0) {
      params.start = start;
    }

    const response = await axios.get(SERPAPI_URL, { params });
    return response.data;
  } catch (error) {
    console.error('SerpApi request failed:', error.message);
    throw new Error('SERPAPI_REQUEST_FAILED');
  }
};

/**
 * Search for events using SerpApi (Google Events engine) - Returns array of events
 * @param {string} query - The search query (e.g., "Events in Bangkok")
 * @param {string} [dateFilter] - Optional date filter (today, tomorrow, week, month)
 * @param {number} [start=0] - Optional offset for pagination
 * @returns {Promise<Array>} - Array of event results
 */
export const searchEvents = async (query, dateFilter, start = 0) => {
  const data = await fetchSerpData(query, dateFilter, start);
  // SerpApi returns results in events_results array
  return data.events_results || [];
};

/**
 * Search for events using SerpApi - Returns full response data
 * @param {string} query - The search query
 * @param {number} [start=0] - Optional offset for pagination
 * @returns {Promise<Object>} - Full response object from SerpApi
 */
export const searchEventsFull = (query, start = 0) => {
  return fetchSerpData(query, null, start);
};
