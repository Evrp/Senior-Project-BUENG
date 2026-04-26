import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SERPAPI_URL = 'https://serpapi.com/search.json';
const API_KEY = process.env.SERPAPI_API_KEY;

/**
 * Common internal function to fetch data from SerpApi
 */
const fetchSerpData = async (query, dateFilter = null) => {
  if (!API_KEY) {
    throw new Error('SERPAPI_API_KEY_MISSING');
  }

  try {
    const response = await axios.get(SERPAPI_URL, {
      params: {
        engine: 'google_events',
        q: query,
        google_domain: 'google.co.th',
        htichips: dateFilter ? `date:${dateFilter}` : 'date:week',
        api_key: API_KEY,
      },
    });
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
 * @returns {Promise<Array>} - Array of event results
 */
export const searchEvents = async (query, dateFilter) => {
  const data = await fetchSerpData(query, dateFilter);
  // SerpApi returns results in events_results array
  return data.events_results || [];
};

/**
 * Search for events using SerpApi - Returns full response data
 * @param {string} query - The search query
 * @returns {Promise<Object>} - Full response object from SerpApi
 */
export const searchEventsFull = (query) => {
  return fetchSerpData(query);
};
