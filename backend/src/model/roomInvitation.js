import mongoose from 'mongoose';

const roomInvitationSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },
    roomName: { type: String, required: true },
    senderEmail: { type: String, required: true },
    senderNickname: { type: String, required: true },
    targetEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export const RoomInvitation = mongoose.model('RoomInvitation', roomInvitationSchema);
