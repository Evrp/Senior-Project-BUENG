import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'กรุณาระบุชื่อห้อง'],
    unique: true,
    trim: true,
  },
  image: {
    type: String,
    required: [true, 'กรุณาใส่ URL รูปภาพ'],
  },
  description: String,
  roomId: String,
  memberLimit: {
    type: Number,
    required: [true, 'กรุณาระบุจำนวนสมาชิกสูงสุด'],
    min: 1,
  },
  tags: [String],
  type: {
    type: String,
    enum: ['public', 'private'],
    default: 'public',
  },
  password: {
    type: String,
  },
  createdBy: String, // ชื่อหรืออีเมลของผู้สร้าง
}, { timestamps: true });

export const Room = mongoose.model('Room', roomSchema);
