import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Event } from './src/model/event.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("MONGO_URI not found in .env");
  process.exit(1);
}

async function fixDates() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    // Find all events
    const events = await Event.find({});
    let updatedCount = 0;
    const currentYear = new Date().getFullYear();

    for (const event of events) {
      if (event.date) {
        const d = new Date(event.date);
        // Check if the year is 2001 and the raw string doesn't contain 2001
        if (d.getFullYear() === 2001) {
          const rawDateStr = event.dateRaw ? String(event.dateRaw) : '';
          if (!rawDateStr.includes('2001')) {
            // It's a bugged date
            const month = d.getMonth();
            const dateStr = `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
            
            // Re-parse with current year
            let fixedDate = new Date(`${rawDateStr} ${currentYear}`);
            if (isNaN(fixedDate.getTime())) {
                // fallback
                fixedDate = new Date(`${dateStr} ${currentYear}`);
            }

            if (!isNaN(fixedDate.getTime())) {
              event.date = fixedDate;
              await event.save();
              updatedCount++;
            }
          }
        }
      }
    }

    console.log(`Successfully fixed dates for ${updatedCount} events.`);
  } catch (error) {
    console.error("Error fixing dates:", error);
  } finally {
    mongoose.connection.close();
  }
}

fixDates();
