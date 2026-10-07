import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { Matchmaker } from './sockets/matchmaker';
import { checkMessage, generateCompanionReply, generateReply, typingDelayMs, type Mood, type Turn } from './ai/companion';

dotenv.config();
const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'ghostchat-local-secret';
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

type AuthRequest = Request & { userId?: string };
const auth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try { req.userId = (jwt.verify(token, JWT_SECRET) as { userId: string }).userId; next(); }
  catch { return res.status(401).json({ error: 'Invalid session' }); }
};
const publicUser = (user: any) => ({ id: user.id, username: user.username, email: user.email, interests: JSON.parse(user.interestsJson || '[]'), languagePref: user.languagePref, isProfilePublic: user.isProfilePublic, isOnline: user.isOnline });
const tokenFor = (id: string) => jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });

const onlineSockets = new Set<string>();

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/online-count', (_req, res) => res.json({ count: onlineSockets.size }));
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password || password.length < 6) return res.status(400).json({ error: 'Email, username and a 6+ character password are required' });
    const user = await prisma.user.create({ data: { email: email.toLowerCase(), username, passwordHash: await bcrypt.hash(password, 10) } });
    return res.status(201).json({ token: tokenFor(user.id), user: publicUser(user) });
  } catch { return res.status(409).json({ error: 'Email or username is already in use' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: String(req.body.email || '').toLowerCase() } });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ error: 'Incorrect email or password' });
  return res.json({ token: tokenFor(user.id), user: publicUser(user) });
});
app.get('/api/me', auth, async (req: AuthRequest, res) => res.json({ user: publicUser(await prisma.user.findUniqueOrThrow({ where: { id: req.userId } })) }));
app.patch('/api/me/profile', auth, async (req: AuthRequest, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (username.length < 2 || !email.includes('@')) return res.status(400).json({ error: 'Enter a valid username and email' });
    const user = await prisma.user.update({ where: { id: req.userId }, data: { username, email } });
    return res.json({ user: publicUser(user) });
  } catch { return res.status(409).json({ error: 'That username or email is already in use' }); }
});
app.patch('/api/me/preferences', auth, async (req: AuthRequest, res) => {
  const { interests, languagePref, isProfilePublic } = req.body;
  const user = await prisma.user.update({ where: { id: req.userId }, data: { interestsJson: JSON.stringify(Array.isArray(interests) ? interests : []), languagePref: languagePref || undefined, isProfilePublic: typeof isProfilePublic === 'boolean' ? isProfilePublic : undefined } });
  return res.json({ user: publicUser(user) });
});
app.get('/api/friends', auth, async (req: AuthRequest, res) => {
  const rows = await prisma.friendship.findMany({ where: { OR: [{ userAId: req.userId }, { userBId: req.userId }] }, include: { userA: true, userB: true } });
  return res.json({ friends: rows.map(row => publicUser(row.userAId === req.userId ? row.userB : row.userA)) });
});
app.post('/api/friends/request', auth, async (req: AuthRequest, res) => {
  if (!req.body.userId || req.body.userId === req.userId) return res.status(400).json({ error: 'Choose another user' });
  return res.json({ request: await prisma.friendRequest.upsert({ where: { requesterId_recipientId: { requesterId: req.userId!, recipientId: req.body.userId } }, update: { status: 'pending' }, create: { requesterId: req.userId!, recipientId: req.body.userId } }) });
});
app.get('/api/friends/requests', auth, async (req: AuthRequest, res) => res.json({ requests: await prisma.friendRequest.findMany({ where: { recipientId: req.userId, status: 'pending' }, include: { requester: true } }) }));
app.post('/api/friends/requests/:id/accept', auth, async (req: AuthRequest, res) => {
  const request = await prisma.friendRequest.findFirstOrThrow({ where: { id: req.params.id, recipientId: req.userId, status: 'pending' } });
  await prisma.$transaction([prisma.friendRequest.update({ where: { id: request.id }, data: { status: 'accepted' } }), prisma.friendship.create({ data: { userAId: request.requesterId, userBId: request.recipientId } })]);
  return res.json({ ok: true });
});
app.post('/api/moderation/block', auth, async (req: AuthRequest, res) => res.json({ block: await prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: req.userId!, blockedId: req.body.userId } }, update: {}, create: { blockerId: req.userId!, blockedId: req.body.userId } }) }));
app.post('/api/moderation/report', auth, async (req: AuthRequest, res) => res.status(201).json({ report: await prisma.report.create({ data: { reporterId: req.userId!, reportedId: req.body.userId, reason: String(req.body.reason || 'Other') } }) }));

const io = new Server(server, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true } });
const aiRooms = new Set<string>();
const aiTranscripts = new Map<string, Turn[]>();
const aiMoods = new Map<string, Mood>();
const aiGreeted = new Map<string, boolean>();
const aiTurns = new Map<string, number>();
const matchmaker = new Matchmaker(io, roomId => {
  aiRooms.add(roomId);
  aiTranscripts.set(roomId, []);
  aiMoods.set(roomId, 'neutral');
  aiGreeted.set(roomId, false);
  aiTurns.set(roomId, 0);
});
const unsafePersonalData = /(address|home|school|workplace|phone|telephone|email|password|login|credit card|bank|money|location|where do you live|full name|real name|social media|instagram|snapchat|whatsapp|meet in person)/i;
const AI_ROOM_TTL_MS = 1000 * 60 * 60;
const dropAiRoom = (roomId: string) => {
  aiRooms.delete(roomId);
  aiTranscripts.delete(roomId);
  aiMoods.delete(roomId);
  aiGreeted.delete(roomId);
  aiTurns.delete(roomId);
};
const emitAiMessage = (socket: any, roomId: string, content: string, delay: number) => {
  setTimeout(() => socket.emit('ai_typing', { roomId }), Math.max(50, delay - typingDelayMs(content)));
  setTimeout(() => {
    socket.emit('ai_typing', { roomId, done: true });
    socket.emit('receive_message', { id: `ai_${Date.now()}`, senderId: 'ai', content, timestamp: Date.now(), roomId });
  }, delay);
};

/** The greeting is its own message, so the room feels alive the moment it opens. */
const greetAiRoom = (socket: any, roomId: string, interests: string[], language: string) => {
  if (aiGreeted.get(roomId)) return;
  aiGreeted.set(roomId, true);
  const opener = generateReply({ message: '', interests, history: [], language });
  aiTranscripts.set(roomId, [{ from: 'ai', content: opener.content }]);
  emitAiMessage(socket, roomId, opener.content, typingDelayMs(opener.content) + 100);
};

const replyToAiRoom = async (socket: any, roomId: string, data: any) => {
  const interests = Array.isArray(data.interests) ? data.interests : [];
  const language = typeof data.language === 'string' ? data.language : 'en';
  const content = String(data.content || '');
  const transcript = aiTranscripts.get(roomId) || [];

  socket.emit('ai_typing', { roomId });
  const reply = await generateCompanionReply({
    message: content,
    interests,
    language,
    history: [...transcript, { from: 'user', content }],
    previousMood: aiMoods.get(roomId),
  });
  const nextTranscript: Turn[] = [...transcript, { from: 'user', content }, { from: 'ai', content: reply.content }];
  aiTranscripts.set(roomId, nextTranscript);
  aiMoods.set(roomId, reply.mood || 'neutral');
  aiTurns.set(roomId, (aiTurns.get(roomId) || 0) + 1);

  if (reply.crisis) socket.emit('ai_crisis', { roomId });
  if (reply.blocked) socket.emit('ai_boundary', { roomId, reason: reply.content });

  const delay = typingDelayMs(reply.content);
  emitAiMessage(socket, roomId, reply.content, delay);
  if (reply.followUp) emitAiMessage(socket, roomId, reply.followUp, delay + 400);
  if (reply.suggestions?.length) socket.emit('ai_suggestions', { roomId, suggestions: reply.suggestions });

  setTimeout(() => { if (aiRooms.has(roomId)) dropAiRoom(roomId); }, AI_ROOM_TTL_MS);
};
io.on('connection', socket => {
  const connectedUserId = String(socket.handshake.auth?.userId || 'anonymous');
  onlineSockets.add(socket.id);
  if (connectedUserId !== 'anonymous') prisma.user.update({ where: { id: connectedUserId }, data: { isOnline: true } }).catch(() => undefined);
  socket.on('join_queue', data => matchmaker.addToQueue(socket, { userId: connectedUserId, queueId: String(data.queueId || ''), interests: data.interests || [], language: data.language }));
  socket.on('leave_queue', () => matchmaker.removeFromQueue(socket.id));
  socket.on('ai_room_ready', data => {
    const roomId = String(data?.roomId || '');
    if (!aiRooms.has(roomId)) return;
    greetAiRoom(socket, roomId, Array.isArray(data?.interests) ? data.interests : [], String(data?.language || 'en'));
  });
  socket.on('send_message', data => {
    if (aiRooms.has(data.roomId)) {
      if (data.imageData) {
        socket.emit('message_blocked', { reason: 'Image sharing is not available in AI chats.' });
        return;
      }
      void replyToAiRoom(socket, data.roomId, data);
      return;
    }
    if (unsafePersonalData.test(String(data.content || ''))) {
      socket.emit('message_blocked', { reason: 'Please keep personal information out of chat.' });
      return;
    }
    if (data.imageData !== undefined && (
      typeof data.imageData !== 'string'
      || data.imageData.length > 700000
      || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.imageData)
    )) {
      socket.emit('message_blocked', { reason: 'Choose a supported image no larger than 500 KB.' });
      return;
    }
    socket.to(data.roomId).emit('receive_message', data);
  });
  socket.on('disconnect', () => {
    onlineSockets.delete(socket.id);
    matchmaker.removeFromQueue(socket.id);
    if (connectedUserId !== 'anonymous') prisma.user.update({ where: { id: connectedUserId }, data: { isOnline: false } }).catch(() => undefined);
  });
});
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
