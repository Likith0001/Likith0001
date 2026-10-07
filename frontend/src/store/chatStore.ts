import { create } from 'zustand';
interface Message {
  id: string;
  senderId: string;
  content: string;
  imageData?: string;
  timestamp: number;
  emotion?: string;
  mood?: string;
  guarded?: boolean;
  crisis?: boolean;
}
interface ChatState {
  roomId: string | null;
  messages: Message[];
  isSearching: boolean;
  aiTyping: boolean;
  setRoomId: (id: string | null) => void;
  addMessage: (msg: Message) => void;
  setIsSearching: (status: boolean) => void;
  setAiTyping: (typing: boolean) => void;
  clearChat: () => void;
}
export const useChatStore = create<ChatState>((set) => ({
  roomId: null,
  messages: [],
  isSearching: false,
  aiTyping: false,
  setRoomId: (id) => set({ roomId: id }),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setIsSearching: (status) => set({ isSearching: status }),
  setAiTyping: (typing) => set({ aiTyping: typing }),
  clearChat: () => set({ messages: [], roomId: null, isSearching: false, aiTyping: false }),
}));