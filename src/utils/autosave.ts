import { SessionManager } from '../server/sessionManager';
import { Player } from '../models/player';

export class AutosaveManager {
  private intervalId: NodeJS.Timeout | null = null;
  private sessionManager: SessionManager;
  private playerModel: Player;
  private saveInterval: number; // in milliseconds

  constructor(sessionManager: SessionManager, intervalMs: number = 60000) {
    this.sessionManager = sessionManager;
    this.playerModel = new Player();
    this.saveInterval = intervalMs;
  }

  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    this.intervalId = setInterval(async () => {
      await this.saveAllPlayers();
    }, this.saveInterval);

    console.log(`Autosave started (every ${this.saveInterval / 1000} seconds)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Autosave stopped');
    }
  }

  async saveAllPlayers(): Promise<void> {
    const authenticatedSessions = this.sessionManager.getAuthenticated();

    for (const session of authenticatedSessions) {
      if (session.userId && session.roomId !== undefined) {
        try {
          await this.playerModel.updateRoom(session.userId, session.roomId);
          await this.playerModel.updateLastSeen(session.userId);
        } catch (error) {
          console.error(`Failed to autosave player ${session.username}:`, error);
        }
      }
    }

    if (authenticatedSessions.length > 0) {
      console.log(`Autosaved ${authenticatedSessions.length} player(s)`);
    }
  }

  async savePlayer(userId: number, roomId: number): Promise<void> {
    try {
      await this.playerModel.updateRoom(userId, roomId);
      await this.playerModel.updateLastSeen(userId);
    } catch (error) {
      console.error(`Failed to save player ${userId}:`, error);
    }
  }
}