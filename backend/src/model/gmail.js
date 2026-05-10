import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    displayName: String,
    email: {
      type: String,
      unique: true,
      match: [/^\w+([.-]?\w+)*@bumail\.net$/, 'Please fill a valid @bumail.net address'],
    },
    photoURL: String,
    photosOrder: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserPhoto',
        default: [],
      },
    ],
    isVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: null },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSchema.index({ lastActiveAt: 1 });

// Cascade Delete: เมื่อลบ User ให้ลบข้อมูลที่เกี่ยวข้องทั้งหมด
userSchema.pre('findOneAndDelete', async function (next) {
  const user = await this.model.findOne(this.getQuery()).select('email');
  if (user && user.email) {
    const email = user.email;
    await Promise.all([
      mongoose.model('Like').deleteMany({ userEmail: email }),
      mongoose.model('filters').deleteMany({ email: email }), // ชื่อ model 'filters' (จาก Filter export)
      mongoose.model('InfoMatch').deleteMany({
        $or: [{ email: email }, { usermatch: email }],
      }),
      mongoose.model('Friend').deleteMany({ email: email }),
    ]);
  }
  next();
});

export const Gmail = mongoose.model('gmails', userSchema);
