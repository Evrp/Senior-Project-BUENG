import express from 'express';
import { Event } from '../model/event.js';
import { Filter } from '../model/filter.js';
import mongoose from 'mongoose';
import { Gmail } from '../model/gmail.js';
import { UserPhoto } from '../model/userPhoto.js';
import { UserEvent } from '../model/userevent.model.js';
import { Friend } from '../model/Friend.js';
import { Like } from '../model/like.js';
import { getUserEventsForPreferences } from '../services/eventService.js';

export default function (io) {
  const router = express.Router();
  // Get filter by email
  router.get('/filters/:email', async (req, res) => {
    try {
      const filter = await Filter.findOne({ email: req.params.email });
      res.json(filter || null);
    } catch (error) {
      console.error('Error fetching filters:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });
  // Get events with optional simple filtering
  router.get('/events/:email', async (req, res) => {
    const { email } = req.params;
    const { page = 1, limit = 10 } = req.query;

    try {
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const result = await getUserEventsForPreferences({ email, page, limit });
      return res.status(200).json(result);
    } catch (error) {
      console.error('Error fetching events:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  //// Get All Events
  router.get('/events', async (req, res) => {
    try {
      // --- SOFT DELETE CHANGE: Only find active events ---
      const events = await Event.find().sort({
        // Removed status filter as Event model no longer has it
        createdAt: -1,
      });
      if (!events || events.length === 0) {
        return res.status(200).json({ message: 'No events found' });
      }
      if (events.length > 0) {
        return res.status(200).json(events);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  });

  // Delete event by id
  router.delete('/events/:id', async (req, res) => {
    const { id } = req.params;
    const { email } = req.body; // Get user email from request body
    try {
      if (!email) return res.status(400).json({ message: 'User email is required.' });
      // --- SOFT DELETE CHANGE: Update status to 'deleted' instead of deleting ---
      const updatedUserEvent = await UserEvent.findOneAndUpdate(
        { eventId: id, email: email }, // Find by eventId (template ID) and user email
        { status: 'deleted' },
        { new: true }
      );
      if (!updatedUserEvent) {
        return res.status(404).json({ message: 'Event not found' });
      }
      io.emit('events_updated');
      res.json({ message: 'Event marked as deleted', userEvent: updatedUserEvent });
    } catch (err) {
      console.error('Error deleting event:', err);
      res.status(500).json({ message: 'Delete failed' });
    }
  });

  // Delete all events by user
  router.delete('/events/user/:email', async (req, res) => {
    const { email } = req.params;
    try {
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }
      // --- SOFT DELETE CHANGE: Update status to 'deleted' for all user's events ---
      const result = await UserEvent.updateMany(
        // Change from Event to UserEvent
        { email: email },
        { $set: { status: 'deleted' } }
      );
      if (result.modifiedCount === 0 && result.matchedCount === 0) {
        // Check matchedCount too for no existing docs
        return res.status(404).json({ message: 'Events not found' });
      }
      io.emit('events_updated');
      res.status(200).json({ message: 'ลบกิจกรรมทั้งหมดเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('Error deleting all user events:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบกิจกรรม' });
    }
  });

  // Friend match
  router.get('/matches/:email', async (req, res) => {
    const { email } = req.params;
    try {
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }
      const user = await Filter.findOne({ email });
      if (!user) return res.status(404).json({ message: 'User not found' });
      const matches = await Filter.find({
        email: { $ne: email },
        genres: { $in: user.genres },
      });
      const matchEmails = matches.map((m) => m.email);

      const [gmailUsers, allInfos] = await Promise.all([
        Gmail.find({ email: { $in: matchEmails } })
          .select('email displayName photoURL photosOrder')
          .lean(),
        mongoose
          .model('Info')
          .find({ email: { $in: matchEmails } })
          .select('email nickname')
          .lean(),
      ]);

      const infoMap = new Map(allInfos.map((info) => [info.email, info.nickname]));

      // Resolve actual profile pictures
      const photoIdStrings = [];
      gmailUsers.forEach((u) => {
        if (u.photosOrder && u.photosOrder.length > 0) {
          photoIdStrings.push(u.photosOrder[0]);
        }
      });

      const photoMap = new Map();
      if (photoIdStrings.length > 0) {
        const validPhotoIds = photoIdStrings
          .filter((id) => id && mongoose.isValidObjectId(id))
          .map((id) => new mongoose.Types.ObjectId(id));

        if (validPhotoIds.length > 0) {
          const photos = await UserPhoto.find({ _id: { $in: validPhotoIds } })
            .select('_id url')
            .lean();
          photos.forEach((p) => photoMap.set(p._id.toString(), p.url));
        }
      }

      // Fallback logic for photos
      const usersNeedFallback = gmailUsers.filter(
        (u) => !u.photosOrder || u.photosOrder.length === 0
      );
      if (usersNeedFallback.length > 0) {
        const fallbackEmails = usersNeedFallback.map((u) => u.email);
        const latestPhotos = await UserPhoto.aggregate([
          { $match: { email: { $in: fallbackEmails } } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: '$email', url: { $first: '$url' } } },
        ]);
        const fallbackMap = new Map(latestPhotos.map((p) => [p._id, p.url]));
        gmailUsers.forEach((u) => {
          if (!u.photosOrder || u.photosOrder.length === 0) {
            const recentPhoto = fallbackMap.get(u.email);
            if (recentPhoto) u.photoURL = recentPhoto;
          }
        });
      }

      const combinedMatches = matches.map((match) => {
        const gmailUser = gmailUsers.find((g) => g.email === match.email);
        let finalPhotoURL = gmailUser?.photoURL || '';
        if (gmailUser?.photosOrder && gmailUser.photosOrder.length > 0) {
          const customPhoto = photoMap.get(gmailUser.photosOrder[0].toString());
          if (customPhoto) finalPhotoURL = customPhoto;
        }

        let finalDisplayName = gmailUser?.displayName || '';
        const nickname = infoMap.get(match.email);
        if (nickname) finalDisplayName = nickname;

        return {
          ...match.toObject(),
          displayName: finalDisplayName,
          photoURL: finalPhotoURL,
        };
      });

      // Ensure results are unique by email
      const uniqueMatches = Array.from(
        new Map(combinedMatches.map((item) => [item.email, item])).values()
      );

      res.json(uniqueMatches);
    } catch (error) {
      console.error('Error fetching matches:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Social Proof: Get friends who liked this event
  router.get('/events/:eventId/social-proof/:email', async (req, res) => {
    const { eventId, email } = req.params;
    try {
      // 1. Get user's friends
      const userFriendRecord = await Friend.findOne({ email });
      if (!userFriendRecord || !userFriendRecord.friends || userFriendRecord.friends.length === 0) {
        return res.json({ friends: [], totalCount: 0 });
      }

      const friendEmails = userFriendRecord.friends.map((f) => f.email);

      // 2. Find which friends liked this event
      const likes = await Like.find({
        eventId: eventId,
        userEmail: { $in: friendEmails },
      }).limit(5);

      if (likes.length === 0) {
        return res.json({ friends: [], totalCount: 0 });
      }

      const matchingFriendEmails = likes.map((l) => l.userEmail);

      // 3. Get profile info for these friends
      const [friendProfilesData, allInfos] = await Promise.all([
        Gmail.find({ email: { $in: matchingFriendEmails } })
          .select('email displayName photoURL photosOrder')
          .lean(),
        mongoose
          .model('Info')
          .find({ email: { $in: matchingFriendEmails } })
          .select('email nickname')
          .lean(),
      ]);

      const infoMap = new Map(allInfos.map((info) => [info.email, info.nickname]));

      // Resolve the actual profile pictures by checking the newest UserPhoto if photosOrder is used
      const photoIdStrings = [];
      friendProfilesData.forEach((u) => {
        if (u.photosOrder && u.photosOrder.length > 0) {
          photoIdStrings.push(u.photosOrder[0]);
        }
      });

      const photoMap = new Map();
      if (photoIdStrings.length > 0) {
        const validPhotoIds = photoIdStrings
          .filter((id) => id && mongoose.isValidObjectId(id))
          .map((id) => new mongoose.Types.ObjectId(id));

        if (validPhotoIds.length > 0) {
          const photos = await UserPhoto.find({ _id: { $in: validPhotoIds } })
            .select('_id url')
            .lean();
          photos.forEach((p) => photoMap.set(p._id.toString(), p.url));
        }
      }

      // Fallback logic for photos
      const usersNeedFallback = friendProfilesData.filter(
        (u) => !u.photosOrder || u.photosOrder.length === 0
      );
      if (usersNeedFallback.length > 0) {
        const fallbackEmails = usersNeedFallback.map((u) => u.email);
        const latestPhotos = await UserPhoto.aggregate([
          { $match: { email: { $in: fallbackEmails } } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: '$email', url: { $first: '$url' } } },
        ]);
        const fallbackMap = new Map(latestPhotos.map((p) => [p._id, p.url]));
        friendProfilesData.forEach((u) => {
          if (!u.photosOrder || u.photosOrder.length === 0) {
            const recentPhoto = fallbackMap.get(u.email);
            if (recentPhoto) u.photoURL = recentPhoto;
          }
        });
      }

      const friendProfiles = friendProfilesData.map((user) => {
        let finalPhotoURL = user.photoURL;
        if (user.photosOrder && user.photosOrder.length > 0) {
          const customPhoto = photoMap.get(user.photosOrder[0].toString());
          if (customPhoto) finalPhotoURL = customPhoto;
        }

        let finalDisplayName = user.displayName || '';
        const nickname = infoMap.get(user.email);
        if (nickname) finalDisplayName = nickname;

        return {
          email: user.email,
          displayName: finalDisplayName,
          photoURL: finalPhotoURL,
        };
      });

      const totalCount = await Like.countDocuments({
        eventId: eventId,
        userEmail: { $in: friendEmails },
      });

      res.json({
        friends: friendProfiles,
        totalCount,
      });
    } catch (error) {
      console.error('Error fetching social proof:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
}
