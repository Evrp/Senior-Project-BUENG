import express from 'express';
import { Room } from '../model/room.js';
import { Info } from '../model/info.js';
import { UserPhoto } from '../model/userPhoto.js';
import { requireOwner } from '../middleware/required.js'; // Import middleware for authentication
import { Gmail } from '../model/gmail.js';
const router = express.Router();

// Join community
router.post('/join-community', requireOwner, async (req, res) => {
  const { userEmail, roomId, roomName, password } = req.body;

  // Validate input
  if (!userEmail || !roomId || !roomName) {
    return res.status(400).json({ error: 'กรุณาระบุ userEmail, roomId, และ roomName' });
  }

  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'ไม่พบห้องที่ต้องการเข้าร่วม' });
    }

    // ตรวจสอบรหัสผ่านถ้าเป็นห้อง private
    if (room.type === 'private') {
      if (!password) {
        return res.status(400).json({ error: 'ห้องนี้เป็นห้องส่วนตัว กรุณาระบุรหัสผ่าน', isPrivate: true });
      }
      if (room.password !== password) {
        return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง', isPrivate: true });
      }
    }

    const existingRoom = await Info.findOne({
      email: userEmail,
      'joinedRooms.roomId': roomId,
      'joinedRooms.roomName': roomName,
    });

    if (existingRoom) {
      return res.status(409).json({ error: 'คุณได้เข้าร่วมห้องนี้แล้ว' });
    }

    // Use $addToSet to prevent duplicate entries
    const updatedUser = await Info.findOneAndUpdate(
      { email: userEmail },
      { $addToSet: { joinedRooms: { roomId, roomName } } },
      { new: true, runValidators: true, upsert: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    }

    res.json(updatedUser);
  } catch (err) {
    console.error('Error joining community:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเข้าร่วมห้อง' });
  }
});

// Create room
router.post('/createroom', requireOwner, async (req, res) => {
  try {
    const { name, image, description, memberLimit, type, tags, password } = req.body;
    const createdBy = req.user.email; // Get user from authenticated middleware

    // --- Enhanced Validation ---
    if (!name || !image || !memberLimit || !type) {
      return res.status(400).json({
        error: 'กรุณาระบุข้อมูลให้ครบถ้วน: ชื่อ, รูปภาพ, จำนวนสมาชิกสูงสุด, และประเภทของห้อง',
      });
    }

    if (type === 'private' && !password) {
      return res.status(400).json({
        error: 'กรุณาระบุรหัสผ่านสำหรับห้องส่วนตัว',
      });
    }

    if (typeof memberLimit !== 'number' || memberLimit <= 0) {
      return res.status(400).json({ error: 'จำนวนสมาชิกสูงสุดต้องเป็นตัวเลขที่มากกว่า 0' });
    }

    // Requirement: ชื่อห้องห้ามซ้ำ
    const existingRoom = await Room.findOne({ name: name.trim() });
    if (existingRoom) {
      return res.status(409).json({ error: 'มีห้องชื่อนี้อยู่แล้ว' }); // 409 Conflict
    }

    const newRoom = new Room({
      name: name.trim(),
      image,
      description,
      memberLimit,
      type,
      password: type === 'private' ? password : null,
      tags: tags || [],
      createdBy,
    });

    const savedRoom = await newRoom.save();

    res.status(201).json(savedRoom);
  } catch (err) {
    console.error('Error creating room:', err); // Log the full error on the server
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างห้อง' });
  }
});

// Get all rooms
router.get('/allrooms', async (req, res) => {
  try {
    const rooms = await Room.find().lean();

    // Aggregate เพื่อหาจำนวนคนที่ join แต่ละห้องจาก Info model
    const roomCounts = await Info.aggregate([
      { $unwind: '$joinedRooms' },
      { $group: { _id: '$joinedRooms.roomId', count: { $sum: 1 } } },
    ]);

    // แปลงเป็น Map เพื่อให้เข้าถึงข้อมูลได้เร็ว (O(1))
    const countMap = roomCounts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    // รวมจำนวนคนเข้ากับข้อมูลห้อง
    const roomsWithCount = rooms.map((room) => ({
      ...room,
      memberCount: countMap[room._id.toString()] || 0,
    }));

    res.json(roomsWithCount);
  } catch (err) {
    console.error('Error fetching rooms:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลห้อง' });
  }
});

// Get room by ID
router.get('/room/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Optimize: Fetch room and members in parallel
    const [room, membersInfo] = await Promise.all([
      Room.findById(id).lean(),
      Info.find({ 'joinedRooms.roomId': id }).select('email nickname').lean(),
    ]);

    if (!room) {
      return res.status(404).json({ error: 'ไม่พบห้อง' });
    }

    const memberEmails = membersInfo.map((m) => m.email);

    // Fetch users from Gmail model to check for custom photo order
    const users = await Gmail.find({ email: { $in: memberEmails } }).lean();

    // Optimization: Batch fetch photos for users with custom order
    const photoIds = users
      .filter((u) => u.photosOrder && u.photosOrder.length > 0)
      .map((u) => u.photosOrder[0]);

    let customPhotoMap = new Map();
    if (photoIds.length > 0) {
      const photos = await UserPhoto.find({ _id: { $in: photoIds } })
        .select('_id url')
        .lean();
      customPhotoMap = new Map(photos.map((p) => [p._id.toString(), p.url]));
    }

    // Create a map for O(1) lookup of final photo URLs
    const userPhotoMap = users.reduce((acc, user) => {
      let photoURL = user.photoURL;
      if (user.photosOrder && user.photosOrder.length > 0) {
        const customUrl = customPhotoMap.get(user.photosOrder[0]);
        if (customUrl) photoURL = customUrl;
      }
      acc[user.email] = photoURL;
      return acc;
    }, {});

    // Attach photoURL to member details
    const memberDetails = memberEmails.map((email) => {
      const info = membersInfo.find((m) => m.email === email);
      return {
        email,
        photoURL: userPhotoMap[email] || null,
        nickname: info?.nickname || null,
      };
    });

    res.json({
      ...room,
      members: memberEmails,
      memberDetails,
      memberCount: memberEmails.length,
    });
  } catch (err) {
    console.error('Error fetching room:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลห้อง' });
  }
});

// Delete multiple rooms
router.post('/delete-rooms', requireOwner, async (req, res) => {
  const { selectedRooms } = req.body;
  if (!Array.isArray(selectedRooms) || selectedRooms.length === 0) {
    return res.status(400).json({ message: 'No room IDs provided' });
  }
  try {
    const deletedRooms = await Room.deleteMany({ _id: { $in: selectedRooms } });
    const result = await Info.updateMany(
      {},
      { $pull: { joinedRooms: { roomId: { $in: selectedRooms } } } }
    );
    res.json({
      message: 'Rooms deleted and removed from user joinedRooms',
      deletedCount: deletedRooms.deletedCount,
      updatedUsers: result.modifiedCount,
    });
  } catch (err) {
    console.error('Error deleting rooms:', err);
    res.status(500).json({ message: 'Delete failed' });
  }
});

// Delete joined room
router.delete('/delete-joined-rooms/:roomName/:userEmail', requireOwner, async (req, res) => {
  const { roomName, userEmail } = req.params;
  try {
    const result = await Info.updateOne(
      { email: userEmail },
      { $pull: { joinedRooms: { roomName: roomName } } }
    );
    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User or room not found in joinedRooms',
      });
    }
    res.json({
      success: true,
      message: 'Room removed from user\'s joinedRooms',
      roomName,
      userEmail,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Delete failed', error: err.message });
  }
});

export default router;
