// TypeScript type definitions

export interface Player {
  id: number;
  username: string;
  currentRoomId: number;
  sessionId?: string;
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
  shortDirection: string;
}

export interface Session {
  id: string;
  socket: any; // Node.js Socket
  player?: Player;
  authenticated: boolean;
  buffer: string;
  lastActivity: number;
  awaitingInput?: {
    type: 'signup_username' | 'signup_password' | 'login_username' | 'login_password';
    data?: any;
  };
}

export interface Command {
  name: string;
  description: string;
  requiresAuth: boolean;
  handler: (session: Session, args: string[]) => void;
}