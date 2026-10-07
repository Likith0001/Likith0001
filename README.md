# Stranger Chat

A privacy-minded stranger chat app with anonymous usernames, interest-based matching, real-time Socket.IO rooms, friends, moderation, presence, and language preferences.

## Stack

- Next.js + TypeScript frontend
- Node.js + Express + TypeScript backend
- Prisma ORM with SQLite for easy local setup
- Socket.IO for matchmaking and real-time messages
- Docker Compose foundation for optional PostgreSQL and Redis services

## Local Setup

### 1. Start the backend

```powershell
cd backend
$env:DATABASE_URL="file:./dev.db"
npm install
npm run db:setup
npm run dev
```

The backend runs at `http://localhost:4000`.

### 2. Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000/chat`.

Optional frontend environment variable:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

Optional backend AI environment variables:

```env
AI_API_KEY=your-provider-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

When `AI_API_KEY` is set, ordinary AI-room messages use the configured OpenAI-compatible chat-completions endpoint. Safety-sensitive messages are handled locally before any model request. Without a key, or if the provider is unavailable, the built-in companion continues to work. Recent room turns are sent to the configured provider when model mode is enabled; do not share sensitive information.

## Included Features

- Registration and login with JWT sessions
- Anonymous guest access to stranger chat without creating an account
- Anonymous usernames and private/public profile preference
- Interest and language-aware stranger matchmaking
- Real-time Socket.IO chat rooms
- Human-first matching with a local AI fallback after 10 seconds without a compatible human
- Human-feeling AI companion: opens the conversation itself, types with natural pacing, answers in two beats, reads emotion, follows one topic thread, and remembers what you said earlier in the same room
- AI companion: uses an optional model provider for open-ended conversation, with the built-in conversational engine as an offline fallback; typing state, mood, room context, and suggested next prompts keep the exchange flowing
The companion itself lives in `backend/src/ai/companion.ts`. Model mode receives recent room context only after the local safety layer has allowed the user's message. The built-in path remains layered so it holds up over a whole conversation when no provider is configured:
Human users are always matched first when they share a language and interest. If no compatible human is available after 10 seconds, the app assigns a clearly labeled AI companion. The companion never requests personal information. External model processing is optional and disabled unless `AI_API_KEY` is configured.
- Empathy without pretending: it mirrors feelings and stays present with sad, lonely, anxious, angry, happy, tired, or guarded messages, but never claims to be human when asked directly
- Tone memory: a gentle tone carries across turns, so short replies like "yeah" do not reset it to chirpy neutral
- AI safety restrictions, all enforced before the companion speaks: no personal data or contact details, no meeting up, no romance or sexual content, no money or payments, no slurs, no illegal help, no medical/legal/financial advice, and no instruction-override ("ignore your rules") tricks
- Crisis handling: self-harm messages stop the conversation, route to emergency guidance, and raise a visible banner in the chat
- In-character boundaries: blocked messages get a warm explanation in the conversation itself instead of a dry error banner
- AI replies and the greeting are available in English, Spanish, French, and Hindi
- Online-user count and online presence
- Friend requests, acceptance, and friends list
- Blocking and reporting controls
- Local SQLite database at `backend/prisma/dev.db`
- Docker Compose foundation for PostgreSQL and Redis

## API Highlights

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`
- `PATCH /api/me/preferences`
- `GET /api/online-count`
- `GET /api/friends`
- `POST /api/friends/request`
- `GET /api/friends/requests`
- `POST /api/friends/requests/:id/accept`
- `POST /api/moderation/block`
- `POST /api/moderation/report`

## Matching Safety

Human users are always matched first when they share a language and interest. If no compatible human is available after 10 seconds, the app assigns a clearly labeled AI companion. The AI does not use an external model and never requests personal information.

The companion itself lives in `backend/src/ai/companion.ts` and is layered so it holds up over a whole conversation rather than looping canned lines:

1. **Safety layer** - runs first and always wins. Hard blocks on personal data, contact details, meeting up, romance, sexual content, payments, slurs, illegal help, professional advice, and instruction-override attempts. Self-harm messages short-circuit everything else and return emergency guidance.
2. **Feeling layer** - reads the emotion in each message (including grief, illness, burnout, loneliness, and guardedness) and mirrors it before moving the conversation on. The last mood is carried forward, so a flat "yeah" does not reset the tone.
3. **Conversation layer** - tracks the active topic, prefers the thread already in progress over a passing keyword, and occasionally echoes something you said earlier in the room.
4. **Human layer** - opens the conversation on its own, paces its typing to the length of the reply, sometimes answers in two beats, and offers tappable next prompts. It answers "are you a real person?" honestly instead of deflecting.

In the chat UI, AI rooms show a typing indicator, suggested replies, an honest-limits note, and a crisis banner whenever the safety layer detects a self-harm message.

For production, set a strong `JWT_SECRET`, use HTTPS, add rate limiting, and move moderation review into an administrator workflow.
