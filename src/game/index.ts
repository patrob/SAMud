// Game logic - commands, world state, chat

import { DatabaseManager } from '../db';
import { Session, Player } from '../types';

export class GameManager {
  private db: DatabaseManager;

  constructor(dbPath?: string) {
    this.db = new DatabaseManager(dbPath);
  }

  public async handleSignup(session: Session, username: string, password: string): Promise<boolean> {
    try {
      // Hash password
      const passwordHash = await this.db.hashPassword(password);
      
      // Create user
      const userId = this.db.createUser(username, passwordHash);
      
      // Create player
      const playerId = this.db.createPlayer(userId);
      
      // Update last login
      this.db.updateLastLogin(userId);
      
      // Get player data
      const player = this.db.getPlayer(userId);
      if (!player) {
        throw new Error('Failed to create player');
      }
      
      // Set session data
      session.player = player;
      session.authenticated = true;
      
      return true;
    } catch (error: any) {
      console.error('Signup error:', error.message);
      return false;
    }
  }

  public async handleLogin(session: Session, username: string, password: string): Promise<boolean> {
    try {
      // Get user
      const user = this.db.getUser(username);
      if (!user) {
        return false;
      }
      
      // Verify password
      const isValid = await this.db.verifyPassword(password, user.password_hash);
      if (!isValid) {
        return false;
      }
      
      // Get player
      const player = this.db.getPlayer(user.id);
      if (!player) {
        return false;
      }
      
      // Update last login
      this.db.updateLastLogin(user.id);
      
      // Set session data
      session.player = player;
      session.authenticated = true;
      
      return true;
    } catch (error: any) {
      console.error('Login error:', error.message);
      return false;
    }
  }

  public handleQuit(session: Session): void {
    if (session.player) {
      // Auto-save player location
      this.db.updatePlayerRoom(session.player.id, session.player.currentRoomId);
    }
  }

  public close(): void {
    this.db.close();
  }
}