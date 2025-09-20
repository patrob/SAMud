import { Session } from './session';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  add(session: Session): void {
    this.sessions.set(session.id, session);
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }

  getAuthenticated(): Session[] {
    return this.getAll().filter(s => s.userId !== undefined);
  }

  getByUserId(userId: number): Session | undefined {
    return this.getAll().find(s => s.userId === userId);
  }

  getByUsername(username: string): Session | undefined {
    return this.getAll().find(s => s.username === username);
  }

  getInRoom(roomId: number): Session[] {
    return this.getAll().filter(s => s.roomId === roomId && s.userId !== undefined);
  }

  broadcast(message: string, excludeSessionId?: string): void {
    this.sessions.forEach(session => {
      if (session.id !== excludeSessionId) {
        session.writeLine(message);
      }
    });
  }

  broadcastToRoom(roomId: number, message: string, excludeSessionId?: string): void {
    this.getInRoom(roomId).forEach(session => {
      if (session.id !== excludeSessionId) {
        session.writeLine(message);
      }
    });
  }

  broadcastToAuthenticated(message: string, excludeSessionId?: string): void {
    this.getAuthenticated().forEach(session => {
      if (session.id !== excludeSessionId) {
        session.writeLine(message);
      }
    });
  }
}