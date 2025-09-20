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