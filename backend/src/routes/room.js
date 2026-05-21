import express from 'express';
import { Room } from '../model/room.js';
import { Info } from '../model/info.js';
import { UserPhoto } from '../model/userPhoto.js';
import { requireOwner } from '../middleware/required.js'; // Import middleware for authentication
import { Gmail } from '../model/gmail.js';
import { RoomInvitation } from '../model/roomInvitation.js';
const router = express.Router();

// Join community
router.post('/join-community', requireOwner, async (req, res) => {
  const { userEmail, roomId, roomName, password } = req.body;

  // Validate input
  if (!userEmail || !roomId || !roomName) {
    return res.status(400).json({ error: 'กรุณาระบุ userEmail, roomId, และ roomName' });
  }

  // Safe lowercasing for userEmail
  const targetEmail = userEmail.trim().toLowerCase();

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

    // BUG-03: Enforce Capacity Limits
    const currentMemberCount = await Info.countDocuments({ 'joinedRooms.roomId': roomId });
    if (currentMemberCount >= room.memberLimit) {
      return res.status(403).json({ error: `ห้องนี้เต็มแล้ว (จำกัดสมาชิกสูงสุด ${room.memberLimit} คน)` });
    }

    // BUG-04: Fix joinedRooms duplicate/corruption logic (Query by roomId only)
    const existingRoom = await Info.findOne({
      email: targetEmail,
      'joinedRooms.roomId': roomId,
    });

    if (existingRoom) {
      return res.status(409).json({ error: 'คุณได้เข้าร่วมห้องนี้แล้ว' });
    }

    // Use $addToSet to prevent duplicate entries
    const updatedUser = await Info.findOneAndUpdate(
      { email: targetEmail },
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

    // Automatically join the creator to their newly created room
    const targetEmail = createdBy.trim().toLowerCase();
    await Info.findOneAndUpdate(
      { email: targetEmail },
      { $addToSet: { joinedRooms: { roomId: savedRoom._id.toString(), roomName: savedRoom.name } } },
      { new: true, runValidators: true, upsert: true }
    );

    res.status(201).json(savedRoom);
  } catch (err) {
    console.error('Error creating room:', err); // Log the full error on the server
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างห้อง' });
  }
});

// Edit room
router.put('/editroom/:roomId', requireOwner, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, image, description, memberLimit, type, tags, password } = req.body;
    const userEmail = req.user.email; // Get user from authenticated middleware

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

    // Find the room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'ไม่พบห้องที่ต้องการแก้ไข' });
    }

    // Check ownership
    const isUserAdmin = req.user && req.user.isAdmin;
    if (room.createdBy !== userEmail && !isUserAdmin) {
      return res.status(403).json({ error: 'Forbidden: คุณไม่มีสิทธิ์แก้ไขห้องนี้' });
    }

    // Check if name is changed and if new name is already taken
    if (room.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
      const existingRoom = await Room.findOne({ name: name.trim() });
      if (existingRoom) {
        return res.status(409).json({ error: 'มีห้องชื่อนี้อยู่แล้ว' });
      }
    }

    // Update room fields
    room.name = name.trim();
    room.image = image;
    room.description = description;
    room.memberLimit = memberLimit;
    room.type = type;
    room.password = type === 'private' ? password : null;
    room.tags = tags || [];

    const updatedRoom = await room.save();

    // If the room name changed, update the room name in everyone's joinedRooms array in Info model
    if (room.name !== name.trim()) {
      await Info.updateMany(
        { 'joinedRooms.roomId': roomId },
        { $set: { 'joinedRooms.$.roomName': name.trim() } }
      );
    }

    res.json(updatedRoom);
  } catch (err) {
    console.error('Error editing room:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขห้อง' });
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
    // BUG-01: Verify creator or admin ownership before deleting
    const roomsToDelete = await Room.find({ _id: { $in: selectedRooms } });
    const isUserAdmin = req.user && req.user.isAdmin;
    const userEmail = req.user.email;

    const unauthorized = roomsToDelete.some(
      (room) => room.createdBy !== userEmail && !isUserAdmin
    );

    if (unauthorized) {
      return res.status(403).json({
        error: 'Forbidden: คุณไม่มีสิทธิ์ในการลบห้องบางห้องที่เลือก (สามารถลบได้เฉพาะห้องที่คุณสร้างขึ้นเท่านั้น)',
      });
    }

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

// Search all users in the system to invite
router.get('/search-users', requireOwner, async (req, res) => {
  const { query, roomId } = req.query;
  try {
    if (!query || query.trim() === '') {
      return res.json([]);
    }
    
    const searchRegex = new RegExp(query.trim(), 'i');
    
    // Find matching users in Gmail
    const matchedGmails = await Gmail.find({
      $or: [
        { displayName: searchRegex },
        { email: searchRegex }
      ]
    }).limit(20).lean();
    
    // Find matching users in Info by nickname
    const matchedInfos = await Info.find({
      nickname: searchRegex
    }).limit(20).lean();
    
    // Merge emails
    const emailsSet = new Set([
      ...matchedGmails.map(u => u.email.toLowerCase()),
      ...matchedInfos.map(u => u.email.toLowerCase())
    ]);
    
    // Get all gmails for these emails
    const allMatchingGmails = await Gmail.find({
      email: { $in: Array.from(emailsSet) }
    }).lean();
    
    // Get all matching infos for these emails
    const allMatchingInfos = await Info.find({
      email: { $in: Array.from(emailsSet) }
    }).lean();
    
    // If roomId is provided, exclude members who are already in the room
    let excludedEmails = [];
    if (roomId) {
      const room = await Room.findById(roomId);
      if (room) {
        // Fetch everyone who has this room in joinedRooms
        const roomMembers = await Info.find({ 'joinedRooms.roomId': roomId }).select('email').lean();
        excludedEmails = roomMembers.map(m => m.email.toLowerCase());
      }
    }
    
    // Resolve user details
    const results = allMatchingGmails
      .map(gmail => {
        const info = allMatchingInfos.find(i => i.email.toLowerCase() === gmail.email.toLowerCase());
        return {
          email: gmail.email,
          displayName: gmail.displayName,
          nickname: info?.nickname || null,
          photoURL: gmail.photoURL
        };
      })
      .filter(u => !excludedEmails.includes(u.email.toLowerCase()));
      
    res.json(results);
  } catch (err) {
    console.error('Error searching users:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการค้นหาผู้ใช้' });
  }
});

// Invite a user to a room (real-time socket + database persistent state)
router.post('/invite-to-room', requireOwner, async (req, res) => {
  const { roomId, roomName, targetEmail } = req.body;
  const userEmail = req.user.email;
  
  if (!roomId || !roomName || !targetEmail) {
    return res.status(400).json({ error: 'กรุณาระบุข้อมูลให้ครบถ้วน' });
  }
  
  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'ไม่พบห้องที่ต้องการเชิญ' });
    }
    
    // Verify only the room owner can invite
    if (room.createdBy.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ในการเชิญผู้ใช้อื่นเข้าห้องนี้' });
    }
    
    const targetLower = targetEmail.trim().toLowerCase();
    
    // Check if the target user is already a member
    const isMember = await Info.findOne({
      email: targetLower,
      'joinedRooms.roomId': roomId
    });
    if (isMember) {
      return res.status(400).json({ error: 'ผู้ใช้นี้เป็นสมาชิกในห้องนี้อยู่แล้ว' });
    }
    
    // Check if there is an existing pending invite
    const existingInvite = await RoomInvitation.findOne({
      roomId,
      targetEmail: targetLower,
      status: 'pending'
    });
    
    // Resolve sender's nickname or displayName
    const senderInfo = await Info.findOne({ email: userEmail });
    const senderNickname = senderInfo?.nickname || req.user.displayName || userEmail;
    
    let invitation;
    if (existingInvite) {
      invitation = existingInvite;
    } else {
      // Create new database record for persistent notification (useful when they are offline/re-online)
      invitation = new RoomInvitation({
        roomId,
        roomName,
        senderEmail: userEmail,
        senderNickname,
        targetEmail: targetLower,
        status: 'pending'
      });
      await invitation.save();
    }
    
    // Real-time socket notification
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    const targetSocketId = userSockets[targetLower];
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('notify-room-invite', {
        id: invitation._id,
        roomId,
        roomName,
        senderEmail: userEmail,
        senderNickname,
      });
      return res.json({ success: true, message: 'ส่งคำเชิญเรียบร้อยแล้ว' });
    }
    
    res.json({ success: true, message: 'ส่งคำเชิญแล้ว (ผู้ใช้อยู่ออฟไลน์ จะได้รับคำเชิญเมื่อระบบเชื่อมต่อ)' });
  } catch (err) {
    console.error('Error inviting user:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งคำเชิญ' });
  }
});

// Get pending room invitations for a user
router.get('/room-invitations/:email', requireOwner, async (req, res) => {
  const { email } = req.params;
  const userEmail = req.user.email;
  
  if (email.toLowerCase() !== userEmail.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden: คุณไม่มีสิทธิ์ในการดูคำเชิญของผู้อื่น' });
  }
  
  try {
    const invitations = await RoomInvitation.find({
      targetEmail: email.toLowerCase(),
      status: 'pending'
    }).sort({ createdAt: -1 }).lean();
    
    res.json(invitations);
  } catch (err) {
    console.error('Error fetching invitations:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลคำเชิญ' });
  }
});

// Accept or Reject a room invitation
router.post('/room-invitation/respond', requireOwner, async (req, res) => {
  const { invitationId, response } = req.body;
  const userEmail = req.user.email;
  
  if (!invitationId || !['accept', 'reject'].includes(response)) {
    return res.status(400).json({ error: 'กรุณาระบุ invitationId และ response (accept หรือ reject)' });
  }
  
  try {
    const invitation = await RoomInvitation.findById(invitationId);
    if (!invitation) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำเชิญ' });
    }
    
    if (invitation.targetEmail.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ตอบรับคำเชิญนี้' });
    }
    
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'คำเชิญนี้ได้รับการจัดการไปแล้ว' });
    }
    
    invitation.status = response === 'accept' ? 'accepted' : 'rejected';
    await invitation.save();
    
    if (response === 'accept') {
      // Add the user to the room in the Info collection
      await Info.joinRoom(userEmail, invitation.roomId, invitation.roomName);
    }
    
    res.json({ success: true, message: `จัดการคำเชิญสำเร็จ: ${response}`, roomId: invitation.roomId });
  } catch (err) {
    console.error('Error responding to invitation:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการจัดการคำเชิญ' });
  }
});

// Kick a member from a room
router.post('/kick-member', requireOwner, async (req, res) => {
  const { roomId, targetEmail } = req.body;
  const userEmail = req.user.email;
  
  if (!roomId || !targetEmail) {
    return res.status(400).json({ error: 'กรุณาระบุ roomId และ targetEmail' });
  }
  
  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'ไม่พบห้องที่ระบุ' });
    }
    
    if (room.createdBy.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ในการเตะสมาชิกออกจากห้องนี้' });
    }
    
    const targetLower = targetEmail.trim().toLowerCase();
    
    // Pull from joinedRooms in Info
    await Info.updateOne(
      { email: targetLower },
      { $pull: { joinedRooms: { roomId: roomId } } }
    );
    
    // Send socket notification to the kicked user
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    const targetSocketId = userSockets[targetLower];
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('kicked-from-room', {
        roomId,
        roomName: room.name,
        email: targetLower,
      });
    }
    
    res.json({ success: true, message: 'เตะสมาชิกออกจากห้องเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error kicking member:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเตะสมาชิก' });
  }
});

export default router;
