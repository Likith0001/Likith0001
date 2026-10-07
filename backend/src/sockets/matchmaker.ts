import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';

interface QueueUser {
  socket: Socket;
  userId: string;
  queueId: string;
  interests: string[];
  language: string;
  queuedAt: number;
}

export class Matchmaker {
  private queue: QueueUser[] = [];
  private io: Server;
  private onAiRoom: (roomId: string) => void;

  constructor(io: Server, onAiRoom: (roomId: string) => void) {
    this.io = io;
    this.onAiRoom = onAiRoom;
    setInterval(() => this.processQueue(), 500);
  }

  addToQueue(socket: Socket, userData: { userId: string; queueId: string; interests: string[]; language?: string }) {
    this.removeFromQueue(socket.id);
    this.queue.push({ socket, userId: userData.userId, queueId: userData.queueId, interests: userData.interests, language: userData.language || 'en', queuedAt: Date.now() });
    socket.emit('queue_status', { status: 'waiting' });
    this.processQueue();
  }

  removeFromQueue(socketId: string) {
    this.queue = this.queue.filter(user => user.socket.id !== socketId);
  }

  private processQueue() {
    if (this.queue.length === 0) return;
    const first = this.queue.shift();
    const secondIndex = this.queue.findIndex(user =>
      user.socket.id !== first?.socket.id &&
      (first?.language === user.language || !first?.language || !user.language) &&
      first?.interests.some(interest => user.interests.includes(interest))
    );
    const user1 = first;
    const user2 = secondIndex >= 0 ? this.queue.splice(secondIndex, 1)[0] : undefined;
    if (!user2 && user1 && Date.now() - user1.queuedAt < 12000) {
      this.queue.unshift(user1);
      return;
    }

    if (user1 && user2) {
      const roomId = `room_${randomUUID()}`;
      user1.socket.join(roomId);
      user2.socket.join(roomId);
      user1.socket.emit('match_found', { roomId, queueId: user1.queueId, status: 'matched', peerId: user2.userId });
      user2.socket.emit('match_found', { roomId, queueId: user2.queueId, status: 'matched', peerId: user1.userId });
    } else if (user1) {
      const roomId = `ai_room_${randomUUID()}`;
      user1.socket.join(roomId);
      user1.socket.emit('match_found', { roomId, queueId: user1.queueId, status: 'matched', peerId: 'ai-safe-companion', isAI: true });
      this.onAiRoom(roomId);
    }
  }
}