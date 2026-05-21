# CLAUDE.md — Project Intelligence File

> This file provides architecture, rules, and flows for the **BU Connect** senior project.
> AI assistants and developers should read this file before making changes to the codebase.

---

## 1. Project Overview

**BU Connect** is a social matching and community platform for Bangkok University students.
Users discover events, get AI-matched with peers who share similar interests, chat in real-time,
and participate in community rooms.

- **Domain Restriction:** Only `@bumail.net` email addresses are accepted (enforced at schema level).
- **Authentication:** Firebase Authentication (Google OAuth + Email/Password) → Firebase ID Token → Backend verifies via `firebase-admin`.
- **Deployment:** Frontend on Vercel (Vite build), Backend on a Node.js server.

---

## 2. Architecture

### 2.1 High-Level Stack

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Vite + React 18)        │
│  React Router v6 · React Query v5 · Socket.IO Client│
│  Firebase Auth Client · Axios (with token refresh)   │
└───────────────────────┬─────────────────────────────┘
                        │  HTTPS / WSS
┌───────────────────────▼─────────────────────────────┐
│               Backend (Express + Node.js)            │
│  Firebase Admin SDK · Mongoose ODM · Socket.IO Server│
│  Gemini AI · SerpAPI · Nodemailer · Rate Limiter     │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                 MongoDB Atlas                        │
│  Collections: gmails, infos, rooms, events, likes,   │
│  infomatches, friends, friendrequests, aichatmessages│
│  userphotos, filters, userevents, userrooms          │
└─────────────────────────────────────────────────────┘
```

### 2.2 Backend Directory Structure

```
backend/
├── server.js                   # Express app + Socket.IO + route mounting
├── src/
│   ├── constants/              # Shared constants and enums
│   ├── controllers/            # Controller logic (e.g., genreController)
│   ├── enums/                  # Enum definitions
│   ├── firebase/               # Firebase Admin SDK initialization
│   ├── middleware/
│   │   ├── authMiddleware.js   # Firebase ID token verification (global)
│   │   ├── required.js         # requireOwner + requireAdmin guards
│   │   ├── ratelimit.js        # express-rate-limit wrapper
│   │   └── axiosSecure.js      # Server-side secure axios instance
│   ├── migrations/             # Data migration scripts
│   ├── model/                  # Mongoose schemas
│   │   ├── gmail.js            # User account (Gmail model)
│   │   ├── info.js             # User profile (bio, joinedRooms)
│   │   ├── room.js             # Community room
│   │   ├── event.js            # Events
│   │   ├── like.js             # Event likes
│   │   ├── infomatch.js        # AI matchmaking records
│   │   ├── Friend.js           # Friend list with roomId mapping
│   │   ├── friendRequest.js    # Friend request workflow
│   │   ├── AiChatMessage.js    # AI chatbot messages
│   │   ├── filter.js           # User preference filters
│   │   ├── userPhoto.js        # Uploaded photos
│   │   ├── userevent.model.js  # User-event participation
│   │   ├── userroom.js         # User-room metadata
│   │   └── eventmatch.js       # Event-based matching
│   ├── routes/
│   │   ├── auth.js             # Login, register, email verification
│   │   ├── gmail.js            # User profile CRUD
│   │   ├── info.js             # User info & joined rooms
│   │   ├── room.js             # Community room CRUD
│   │   ├── event.js            # Event discovery & CRUD
│   │   ├── like.js             # Event like/unlike
│   │   ├── infomatch.js        # Matchmaking & swiping
│   │   ├── friend.js           # Friend list operations
│   │   ├── friendRequest.js    # Friend request send/accept/decline
│   │   ├── friendApi.js        # Friend utility APIs
│   │   ├── ai.js               # AI recommendation endpoints
│   │   ├── aichat.js           # AI chatbot endpoints
│   │   ├── make.js             # Make.com webhook integrations
│   │   ├── eventmatch.js       # Event-based matching
│   │   └── userPhoto.js        # Photo upload/reorder
│   └── services/
│       ├── matchService.js     # Core AI matching logic (Gemini)
│       ├── genreService.js     # Genre classification service
│       ├── eventService.js     # Event fetching & processing
│       ├── emailService.js     # Email sending via Nodemailer
│       ├── gemini.js           # Google Gemini AI client
│       ├── serpApiService.js   # SerpAPI event discovery
│       └── eventEmitter.js     # Node.js EventEmitter for async workflows
```

### 2.3 Frontend Directory Structure

```
frontend/src/
├── main.jsx                    # React root: providers wrapping order
├── App.jsx                     # Router with route definitions
├── Navbar.jsx                  # Global navigation bar
├── auth/                       # Login / Register pages
├── home/                       # Home page + Event discovery
│   └── event/                  # Event cards, filters, social proof
├── community/                  # Community room feature
│   ├── community.jsx           # Main page (React Query + room list)
│   ├── createroom.jsx          # Room creation form (popup modal)
│   ├── roomlist.jsx            # Room card grid with join/delete
│   └── roommatch.jsx           # Room-based matching
├── chat/                       # Real-time chat (Socket.IO)
│   └── components/javascript/  # Chat sub-components
├── friend/                     # Friend list management
├── profile/                    # User profile page
├── components/                 # Shared reusable components
│   ├── UserAvatar.jsx          # Image component with fallback
│   ├── HeaderProfile.jsx       # Header profile widget
│   └── RequireLogin.jsx        # Auth guard wrapper
├── context/                    # React Context providers
│   ├── AuthContextProvider.jsx # Firebase auth state
│   ├── socketcontext.jsx       # Socket.IO connection
│   ├── themecontext.jsx        # Dark/light mode
│   ├── notificationContext.jsx # In-app notifications
│   └── make.com.jsx            # Make.com socket provider
├── server/
│   └── api.js                  # Axios instance with auto token refresh
├── firebase/                   # Firebase client config
├── common/                     # Shared utilities
│   └── utils/                  # Helper functions (image, etc.)
└── lib/                        # Third-party integrations
```

### 2.4 Provider Wrapping Order (main.jsx)

The order matters. Context providers are nested as follows:

```
React.StrictMode
  └── QueryClientProvider (React Query)
        └── ThemeProvider
              └── SocketProvider (Socket.IO)
                    └── BrowserRouter
                          └── AuthProvider (Firebase Auth)
                                └── App
```

---

## 3. Data Models (MongoDB Collections)

### 3.1 Core Models

| Model | Collection | Purpose | Key Fields |
|-------|-----------|---------|------------|
| `Gmail` | `gmails` | User account & auth | `email` (unique, @bumail.net), `displayName`, `photoURL`, `photosOrder`, `isVerified` |
| `Info` | `infos` | User profile & rooms | `email` (unique), `nickname`, `userInfo`, `joinedRooms[{roomId, roomName}]` |
| `Room` | `rooms` | Community rooms | `name` (unique), `image`, `memberLimit`, `type` (public/private), `password`, `createdBy`, `tags` |
| `Event` | `events` | Discoverable events | `title`, `date`, `genre`, `description`, `link`, `image`, `createdByAI` |
| `InfoMatch` | `infomatches` | AI matchmaking | `email` ↔ `usermatch`, `eventId`, `status` (pending/matched/unmatched), `chance`, `likedBy`, `swipedBy` |
| `Friend` | `friends` | Friend list | `email`, `friends[{email, roomId, eventId}]`, `following`, `followers` |
| `FriendRequest` | `friendrequests` | Friend request workflow | `from.email`, `to`, `status` (pending/accepted/declined), `roomId`, `eventId` |
| `Like` | `likes` | Event likes | `userEmail`, `eventId` |
| `AiChatMessage` | `aichatmessages` | AI chatbot history | `roomId`, messages |
| `UserPhoto` | `userphotos` | Uploaded photos | `_id`, `url` |

### 3.2 Cascade Delete Rules

- Deleting a **User (Gmail)** → deletes `Like`, `Filter`, `InfoMatch`, `Friend`
- Deleting an **Event** → deletes `Like`, `InfoMatch`, `UserEvent`
- Deleting an **InfoMatch** → deletes `AiChatMessage`

---

## 4. Authentication & Authorization Flow

### 4.1 Auth Pipeline

```
Client Request
  │
  ├── POST /api/auth/*  → Public (no middleware)
  │
  └── All other /api/*  → authMiddleware (global)
        │
        ├── 1. Extract Bearer token from Authorization header
        ├── 2. Verify token via Firebase Admin SDK
        ├── 3. Look up user in Gmail collection
        ├── 4. Auto-create record for Google OAuth users
        ├── 5. Check user.isVerified (reject if false)
        └── 6. Attach user object to req.user → next()
```

### 4.2 Route-Level Guards

| Middleware | Purpose | Usage |
|-----------|---------|-------|
| `authMiddleware` | Global: verifies Firebase ID token, attaches `req.user` | Applied to all `/api/*` except `/api/auth/*` |
| `requireOwner` | Ensures `req.user.email` matches the email in params/body | Used on sensitive routes (join, delete, profile update) |
| `requireAdmin` | Ensures `req.user.isAdmin === true` | Used on admin-only routes |
| `limiter` | Rate limits (15min/5req in production, skipped in dev) | Applied to specific heavy endpoints |

### 4.3 Frontend Token Management (api.js)

- Stores Firebase ID token in `localStorage` as `idToken`.
- Axios request interceptor attaches `Bearer <token>` header to every request.
- On `401` response, attempts a **silent token refresh** via `auth.currentUser.getIdToken(true)`.
- If refresh fails, clears local storage and redirects to `/login`.

---

## 5. Key Application Flows

### 5.1 User Registration & Login

```
1. User visits /login
2. Chooses Google OAuth or Email/Password
3. Firebase Auth creates session → returns ID token
4. Frontend stores token in localStorage
5. authMiddleware verifies token on every API call
6. Gmail record auto-created (Google) or verified via email link (Email/Password)
```

### 5.2 Event Discovery → AI Matching → Chat

```
1. User browses events on /home
2. User "likes" an event → Like record created
3. AI (Gemini) analyzes user profiles + liked events
4. AI creates InfoMatch records (status: pending, chance: %)
5. User views matches on swipe UI (Tinder-style cards)
6. User swipes right → likedBy array updated
7. If mutual like → status changes to "matched"
8. Matched users see each other in chat list
9. Users chat via Socket.IO real-time messaging
10. AI chatbot available for ice-breaker recommendations
```

### 5.3 Community Room Lifecycle

```
1. Authenticated user creates room via /community
2. Room saved with name, image, memberLimit, type, tags, createdBy
3. Other users browse room list (GET /api/allrooms)
4. User clicks Join:
   - Public room → immediate join
   - Private room → prompt for password → verify on backend
   - Backend checks capacity (memberLimit) before allowing join
5. Joined users can chat in room via /chat/:roomId
6. Room creator can delete rooms they own via Delete Mode
```

### 5.4 Friend Request Flow

```
1. User A sends friend request to User B
   - FriendRequest created (status: pending)
   - Real-time notification sent via Socket.IO
2. User B accepts request:
   - FriendRequest status → "accepted"
   - Friend.addFriend() called for both users
   - Private chat room created
3. User B declines request:
   - FriendRequest status → "declined"
```

### 5.5 Real-Time Presence (Socket.IO)

```
Server tracks:
- onlineUsers: Map<email, Set<socketId>>
- userDetails:  Map<email, {displayName, photoURL, email}>
- lastSeenTimes: Map<email, ISO timestamp>

Events:
- 'user-online'  → adds user to online set, broadcasts status
- 'user-offline' → removes user, records lastSeen timestamp
- 'user-ping'    → heartbeat to maintain online status
- 'disconnect'   → cleanup on socket disconnect
```

---

## 6. Development Rules

### 6.1 Email Convention

- All emails MUST be `@bumail.net` (enforced by Mongoose regex validators).
- Always `.toLowerCase().trim()` emails before querying or comparing.
- Frontend stores email in `localStorage` as `userEmail`.

### 6.2 API Convention

- All API routes are prefixed with `/api/`.
- Auth routes live under `/api/auth/` (public, no middleware).
- All other routes require a valid Firebase ID token.
- Use `requireOwner` for user-specific mutations.
- Use `requireAdmin` for admin-only operations.

### 6.3 Frontend State Management

- **Server state:** React Query (`@tanstack/react-query`) with `staleTime` caching.
- **Auth state:** `AuthContextProvider` (Firebase `onAuthStateChanged`).
- **Socket state:** `SocketProvider` (Socket.IO client connection).
- **Theme state:** `ThemeProvider` (dark/light mode toggle).
- **Notifications:** `NotificationProvider` (in-app toast + friend request badges).

### 6.4 Data Fetching Pattern

```javascript
// Standard pattern: useQuery for reads
const { data, isLoading } = useQuery({
  queryKey: ['rooms'],
  queryFn: () => api.get('/api/allrooms').then(res => res.data),
  staleTime: 1000 * 60 * 2,
});

// Standard pattern: useMutation for writes
const mutation = useMutation({
  mutationFn: (payload) => api.post('/api/createroom', payload),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rooms'] }),
});
```

### 6.5 Optimistic Update Safety

When using `queryClient.setQueryData`, always guard against undefined cache:

```javascript
queryClient.setQueryData(['rooms'], (oldData) =>
  Array.isArray(oldData) ? [...oldData, newItem] : [newItem]
);
```

### 6.6 Error Handling

- Backend: Always wrap async route handlers in try/catch with meaningful error responses.
- Frontend: Axios interceptors handle 401 token refresh globally. Component-level errors use `toast` for user feedback.
- Never swallow errors silently (`.catch(() => null)`).

### 6.7 Security Rules

- Room passwords are stored (note: currently plaintext — hashing with bcrypt is recommended).
- `requireOwner` middleware checks `email` OR `userEmail` from both `req.params` and `req.body`.
- Room deletion requires creator ownership (`room.createdBy === req.user.email`) or admin privileges.
- Room joining enforces `memberLimit` capacity checks.
- All `joinedRooms` uniqueness checks are based on `roomId` only (not `roomName`).

### 6.8 File Naming Conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| Backend models | `camelCase.js` | `friendRequest.js` |
| Backend routes | `camelCase.js` | `friendRequest.js` |
| Frontend pages | `camelCase.jsx` | `community.jsx` |
| Frontend components | `PascalCase.jsx` | `UserAvatar.jsx` |
| CSS files | `camelCase.css` in `css/` subfolder | `community/css/community.css` |

### 6.9 Environment Variables

- `MONGO_URI` — MongoDB Atlas connection string
- `PORT` — Backend server port (default: 8080)
- `VITE_APP_API_BASE_URL` — Backend API URL (used by frontend Axios)
- `VITE_APP_WEB_BASE_URL` — Frontend URL (used by backend CORS)
- Firebase config variables for both client and admin SDK
- `GEMINI_API_KEY` — Google Gemini AI API key
- `SERPAPI_KEY` — SerpAPI key for event discovery

---

## 7. Testing

- **Backend:** Jest + Supertest (unit tests in `__tests__/` directories under `routes/` and `model/`).
- **Frontend:** Jest + React Testing Library (configured via `jest.config.cjs`).
- **Lint:** ESLint for both frontend and backend (`npm run lint`).
- **Format:** Prettier (`npm run format`).

### Running Tests

```bash
# Backend
cd backend && npm run lint

# Frontend
cd frontend && npm run lint
cd frontend && npm run build   # Validate production bundle
cd frontend && npm test        # Run Jest tests
```

---

## 8. Common Gotchas

1. **Email casing:** Always lowercase emails before database queries or comparisons.
2. **React Query cache:** `setQueryData` callback receives `undefined` if cache is empty — always guard with `Array.isArray()`.
3. **Socket.IO multi-tab:** A single user can have multiple sockets. `onlineUsers` tracks a `Set<socketId>` per email.
4. **Room deletion auth:** Only room creators or admins can delete rooms. The middleware `requireOwner` skips ownership checks if no email field is present in the request — ensure email fields are passed.
5. **Cascade deletes:** Mongoose `pre` hooks handle cascade deletions. Always use `findOneAndDelete()` or `deleteMany()` (not `remove()`) to trigger hooks.
6. **Token refresh race:** The Axios interceptor uses an `isRefreshing` flag to prevent concurrent token refresh loops.
