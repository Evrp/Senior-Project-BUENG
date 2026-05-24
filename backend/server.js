// ✅ Import libraries และตั้งค่าเบื้องต้น
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import userRoutes from './src/routes/gmail.js';
import friendRoutes from './src/routes/friend.js';
import roomRoutes from './src/routes/room.js';
import infoRoutes from './src/routes/info.js';
import eventRoutes from './src/routes/event.js';
import likeRoutes from './src/routes/like.js'; // Routes from "./routes/like.js";
import roommatchRoutes from './src/routes/eventmatch.js'; // Routes from "./routes/room.js";
import mongoose from 'mongoose';
// import { Filter } from './src/model/filter.js';
// import { Event } from './src/model/event.js';
// import { InfoMatch } from './src/model/infomatch.js';
// import axios from 'axios';

// Import new routes (ES Modules style)
import friendRequestRoutes from './src/routes/friendRequest.js';
import aiRoute from './src/routes/ai.js';
import authRoutes from './src/routes/auth.js';
import friendApiRoutes from './src/routes/friendApi.js';
import userPhotoRoutes from './src/routes/userPhoto.js';
import MakeRoutes from './src/routes/make.js';
import infoMatchRoutes from './src/routes/infomatch.js'; // Import info match routes
import { authMiddleware } from './src/middleware/authMiddleware.js';
// import { saveEventsFromSource } from './src/services/eventService.js';

/////////Midleware for owner and admin/////////
import { limiter } from './src/middleware/ratelimit.js'; // Strings must use singlequote.
// import { Gmail } from './src/model/gmail.js';

const allowedOrigins = process.env.VITE_APP_WEB_BASE_URL;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const port = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;
// const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL; // Moved to GenreService

// ✅ Middleware
// app.use(
//   helmet({
//     crossOriginResourcePolicy: { policy: "cross-origin" },
//     crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
//     contentSecurityPolicy: {
//       directives: {
//         defaultSrc: ["'self'"],
//         imgSrc: ["'self'", "data:", "https:", "blob:"],
//         scriptSrc: ["'self'", "'unsafe-inline'"],
//         styleSrc: ["'self'", "'unsafe-inline'"],
//         connectSrc: ["'self'", ...allowedOrigins],
//       },
//     },
//   })
// );
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// ✅ Body Parsers (Must be before routes)
app.use(express.json({ limit: '5mb' }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

////////Protection Doss and DDos Attack////////
// app.use(
//   rateLimit({
//     windowMs: 1 * 60 * 1000, // 1 minutes
//     max: 500, // limit each IP to 100 requests per windowMs
//     skip: (req, res) => req.method === "GET",
//   })
// );

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ✅ Connect MongoDB
mongoose.connect(MONGO_URI);
const db = mongoose.connection;
db.once('open', () => console.info('🔥 MongoDB Connected'));
db.on('error', (err) => console.error('❌ MongoDB Error:', err));




const onlineUsers = new Map(); // email => Set of socket IDs
const userDetails = new Map(); // email => {displayName, photoURL, email}
const lastSeenTimes = new Map(); // email => timestamp ล่าสุดที่เห็นผู้ใช้
const userSockets = {}; // email => socket.id (เก็บ socket ID ล่าสุดของแต่ละ user)

// ฟังก์ชันส่งสถานะปัจจุบันให้ทุก client
const broadcastUserStatus = () => {
  // ส่งข้อมูลแบบมีโครงสร้างชัดเจน
  const onlineUsersEmails = Array.from(onlineUsers.keys());
  const lastSeenObj = {};

  // แปลง Map เป็น object ธรรมดา
  lastSeenTimes.forEach((timestamp, email) => {
    lastSeenObj[email] = timestamp;
  });

  io.emit('update-users', {
    onlineUsers: onlineUsersEmails,
    lastSeenTimes: lastSeenObj,
  });
};

io.on('connection', (socket) => {
  socket.on('user-online', (user) => {
    const { email, displayName, photoURL } = user;
    if (!email) return;

    socket.email = email;

    // เก็บข้อมูลผู้ใช้
    userDetails.set(email, { displayName, photoURL, email });

    // เพิ่ม socket.id เข้าไปใน Set
    if (!onlineUsers.has(email)) {
      onlineUsers.set(email, new Set());
    }
    onlineUsers.get(email).add(socket.id);

    const userEmail = email.toLowerCase();
    // เก็บ socket ID ล่าสุดของผู้ใช้สำหรับการส่งการแจ้งเตือนส่วนตัว
    userSockets[userEmail] = socket.id;

    // ลบเวลาออฟไลน์ล่าสุด (เพราะตอนนี้ออนไลน์แล้ว)
    lastSeenTimes.delete(email);

    // แจ้งเตือนทุกคนว่ามีคนออนไลน์
    broadcastUserStatus();

    // ส่งเฉพาะข้อมูลผู้ใช้นี้ว่าออนไลน์
    io.emit('user-online', {
      email,
      displayName,
      photoURL,
      isOnline: true,
    });
  });

  socket.on('user-ping', (userData) => {
    // อัปเดตเวลาล่าสุดที่เห็นผู้ใช้
    if (userData && userData.email) {
      const { email, displayName, photoURL } = userData;
      if (onlineUsers.has(email)) {
        // ผู้ใช้ยังออนไลน์อยู่ ไม่ต้องทำอะไร
      } else {
        // ถ้าไม่มี socket id ของผู้ใช้ ให้เพิ่มเข้ามาใหม่
        onlineUsers.set(email, new Set([socket.id]));
        socket.email = email;

        // เก็บข้อมูลผู้ใช้
        if (displayName && photoURL) {
          userDetails.set(email, { displayName, photoURL, email });
        }

        // ลบเวลาออฟไลน์ล่าสุด (เพราะตอนนี้ออนไลน์แล้ว)
        lastSeenTimes.delete(email);

        // แจ้งเตือนทุกคน
        broadcastUserStatus();
      }
    }
  });

  socket.on('user-offline', (userData) => {
    if (userData && userData.email) {
      const { email } = userData;
      if (email && onlineUsers.has(email)) {
        onlineUsers.get(email).delete(socket.id);
        if (onlineUsers.get(email).size === 0) {
          onlineUsers.delete(email);
          // บันทึกเวลาล่าสุดที่ออฟไลน์
          const timestamp = new Date().toISOString();
          lastSeenTimes.set(email, timestamp);

          // ส่งข้อมูลว่าผู้ใช้ออฟไลน์พร้อมเวลาล่าสุด
          io.emit('user-offline', {
            email,
            isOnline: false,
            lastSeen: timestamp,
            displayName: userDetails.get(email)?.displayName,
            photoURL: userDetails.get(email)?.photoURL,
          });
        }
      }

      // ส่ง user list ไปให้ทุก client
      broadcastUserStatus();
    }
  });

  socket.on('disconnect', () => {
    const email = socket.email;
    if (email && onlineUsers.has(email)) {
      onlineUsers.get(email).delete(socket.id);
      if (onlineUsers.get(email).size === 0) {
        onlineUsers.delete(email); // ไม่มี socket เหลือแล้ว
        // บันทึกเวลาล่าสุดที่ออฟไลน์
        const timestamp = new Date().toISOString();
        lastSeenTimes.set(email, timestamp);

        // ส่งข้อมูลว่าผู้ใช้ออฟไลน์พร้อมเวลาล่าสุด
        io.emit('user-offline', {
          email,
          isOnline: false,
          lastSeen: timestamp,
          displayName: userDetails.get(email)?.displayName,
          photoURL: userDetails.get(email)?.photoURL,
        });
      }
    }

    // ส่ง user list ไปให้ทุก client
    broadcastUserStatus();
  });
});
// ✅ Global Routes Setup
app.set('io', io);
app.set('userSockets', userSockets);

// 1. Public Auth Routes (Login, Register, Verification)
app.use('/api/auth', authRoutes);

// 2. Global Auth Middleware for all other /api routes
app.use('/api', authMiddleware);

// 3. Protected API Routes
import * as genreController from './src/controllers/genreController.js';
app.post('/api/update-genres', limiter, genreController.updateGenres);

app.use('/api', MakeRoutes(io));
app.use('/api', userPhotoRoutes);
app.use('/api', infoMatchRoutes(io));
app.use('/api', aiRoute);
app.use('/api', eventRoutes(io));
app.use('/api', friendRequestRoutes);
app.use('/api', userRoutes);
app.use('/api', friendRoutes);
app.use('/api', roomRoutes);
app.use('/api', infoRoutes);
app.use('/api', likeRoutes);
app.use('/api', roommatchRoutes(io));
app.use('/api', friendApiRoutes);

// Debug Route (Protected by authMiddleware now)
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({ path: middleware.route.path, methods: Object.keys(middleware.route.methods) });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: '/api' + handler.route.path,
            methods: Object.keys(handler.route.methods),
          });
        }
      });
    }
  });
  res.json(routes);
});

// เริ่มต้นเซิร์ฟเวอร์
server.listen(port, () => console.info(`🚀 Server is running on port ${port}`));
