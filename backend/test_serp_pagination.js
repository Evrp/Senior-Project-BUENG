import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

async function test() {
  try {
    const response = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_events',
        q: 'Football in Bangkok',
        google_domain: 'google.co.th',
        api_key: process.env.SERPAPI_API_KEY
      }
    });
    console.log("Total events found:", response.data.events_results?.length || 0);
    console.log("Has pagination/next page:", !!response.data.serpapi_pagination);
  } catch (e) {
    console.error(e.message);
  }
}
test();
