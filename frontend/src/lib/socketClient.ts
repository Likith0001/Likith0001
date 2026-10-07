import { io, Socket } from 'socket.io-client';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
class SocketConnection {
  private static instance: Socket | null = null;
  static getInstance(): Socket {
    if (!SocketConnection.instance) {
      SocketConnection.instance = io(SOCKET_URL, {
        autoConnect: false,
        withCredentials: true,
      });
    }
    const userId = typeof window !== 'undefined' ? localStorage.getItem('ghostchat_user_id') : null;
    SocketConnection.instance.auth = { userId };
    return SocketConnection.instance;
  }
}
export const socket = SocketConnection.getInstance();