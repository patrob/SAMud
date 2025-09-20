// Type definitions for the San Antonio MUD

export interface User {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

export interface Player {
  id: number;
  userId: number;
  roomId: number;
  lastSeen: Date;
}

export interface Room {
  id: number;
  name: string;
  description: string;
}

export interface Exit {
  id: number;
  fromRoomId: number;
  toRoomId: number;
  direction: string;
}

export interface NPC {
  id: number;
  name: string;
  roomId: number;
  systemPrompt: string;
  personalityTraits: string;
  conversationContext: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}