import express from 'express';
import jwt from 'jsonwebtoken';
import { Gmail } from '../model/gmail.js';
import { sendVerificationEmail } from '../services/emailService.js';
import admin from '../firebase/firebaseAdmin.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter,
});

// 📌 API สำหรับยืนยัน Token (เมื่อผู้ใช้คลิกลิงก์)
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send('<h1>Invalid Link</h1><p>Missing verification token.</p>');
    }

    // Decode JWT
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res
        .status(400)
        .send(
          '<h1>Invalid or Expired Link</h1><p>The verification link has expired or is invalid.</p>'
        );
    }

    const { email } = decoded;

    // 1. Update user record in MongoDB to mark as verified
    const user = await Gmail.findOneAndUpdate({ email }, { isVerified: true }, { new: true });

    if (!user) {
      return res
        .status(404)
        .send(
          '<h1>User Not Found</h1><p>The user associated with this token could not be found.</p>'
        );
    }

    // 2. Update Firebase Auth user to mark email as verified
    try {
      const firebaseUser = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(firebaseUser.uid, {
        emailVerified: true,
      });
    } catch (fbError) {
      console.error('⚠️ Could not update Firebase emailVerified status:', fbError.message);
      // We don't necessarily want to fail the whole request if this minor update fails,
      // as long as our backend isVerified flag is set.
    }

    console.info('✅ User email verified successfully:', email);

    // Redirect กลับไปหน้า Frontend
    const frontendUrl = process.env.VITE_APP_WEB_BASE_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?verified=true`);
  } catch (error) {
    console.error('Error during email verification:', error);
    res.status(500).send('<h1>Server Error</h1><p>Something went wrong during verification.</p>');
  }
});

// 📌 API สำหรับขอสมัครสมาชิก (สร้าง User ใน Firebase ทันทีแบบ unverified และส่งอีเมล)
router.post('/register-request', upload.single('photo'), async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.endsWith('@bumail.net')) {
      return res.status(400).json({ message: 'Only @bumail.net emails are allowed.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'กรุณาอัปโหลดรูปภาพโปรไฟล์' });
    }

    // 1. Upload the profile picture directly to Firebase Storage
    const bucket = admin.storage().bucket(process.env.VITE_FIREBASE_STORAGE_BUCKET);
    const filename = `${Date.now()}-${req.file.originalname}`;
    const storagePath = `user-photos/${normalizedEmail}/${filename}`;
    const blob = bucket.file(storagePath);

    const uploadToStorage = () => {
      return new Promise((resolve, reject) => {
        const blobStream = blob.createWriteStream({
          metadata: {
            contentType: req.file.mimetype,
          },
          resumable: false,
        });

        blobStream.on('error', (err) => {
          reject(err);
        });

        blobStream.on('finish', async () => {
          try {
            await blob.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
            resolve(publicUrl);
          } catch (err) {
            reject(err);
          }
        });

        blobStream.end(req.file.buffer);
      });
    };

    const photoURL = await uploadToStorage();

    // 2. Create user in Firebase Auth (emailVerified: false)
    try {
      await admin.auth().createUser({
        email: normalizedEmail,
        password,
        displayName,
        photoURL,
        emailVerified: false,
      });
    } catch (firebaseError) {
      if (firebaseError.code === 'auth/email-already-exists') {
        return res.status(400).json({ message: 'อีเมลนี้ถูกใช้งานไปแล้ว' });
      }
      throw firebaseError;
    }

    // 3. Save user record in MongoDB (isVerified: false)
    await Gmail.findOneAndUpdate(
      { email: normalizedEmail },
      {
        displayName,
        photoURL,
        isVerified: false,
      },
      { upsert: true, new: true }
    );

    // 4. Create a JWT for verification link
    const token = jwt.sign({ email: normalizedEmail }, JWT_SECRET, { expiresIn: '1h' });

    // 5. ส่งอีเมลยืนยัน
    await sendVerificationEmail(normalizedEmail, token);

    res.status(200).json({ message: 'สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันบัญชี' });
  } catch (error) {
    console.error('Error in register-request:', error);
    res.status(500).json({
      message: 'ไม่สามารถส่งอีเมลยืนยันได้ หรือเกิดข้อผิดพลาดในการสมัคร',
      error: error.message,
    });
  }
});

// 📌 API สำหรับขอส่งอีเมลยืนยันซ้ำ (กรณีทำหาย) - ยังคงมีอยูเผื่ออนาคต
router.post('/resend-verification', (req, res) => {
  // Logic สำหรับส่งซ้ำ โดยใช้ข้อมูลที่มีอยู่ หรือรับใหม่
  res.status(501).json({ message: 'Not implemented yet.' });
});

export default router;
