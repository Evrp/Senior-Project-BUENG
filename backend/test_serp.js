import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    const response = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_events',
        q: 'Events in Bangkok',
        google_domain: 'google.co.th',
        api_key: process.env.SERPAPI_API_KEY
      }
    });
    const events = response.data.events_results || [];
    console.log(JSON.stringify(events.slice(0, 2).map(e => e.date), null, 2));
  } catch (e) {
    console.error(e.message);
  }
}
test();
