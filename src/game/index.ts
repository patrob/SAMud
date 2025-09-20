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

  public handleLook(session: Session): string[] {
    if (!session.player) {
      return ['You must be logged in to look around.'];
    }

    const room = this.db.getRoom(session.player.currentRoomId);
    if (!room) {
      return ['You are in a void. Something has gone wrong.'];
    }

    const exits = this.db.getRoomExits(session.player.currentRoomId);
    const players = this.db.getPlayersInRoom(session.player.currentRoomId)
      .filter(p => p.username !== session.player!.username);

    const output: string[] = [];
    output.push(room.name);
    output.push(room.description);
    
    if (exits.length > 0) {
      const exitList = exits.map(e => e.direction).join(', ');
      output.push(`Exits: ${exitList}`);
    } else {
      output.push('Exits: none');
    }

    if (players.length > 0) {
      const playerList = players.map(p => p.username).join(', ');
      output.push(`Players here: ${playerList}`);
    } else {
      output.push('Players here: none');
    }

    return output;
  }

  public handleWhere(session: Session): string[] {
    if (!session.player) {
      return ['You must be logged in to see where you are.'];
    }

    const room = this.db.getRoom(session.player.currentRoomId);
    if (!room) {
      return ['You are lost in the void.'];
    }

    return [`You are at: ${room.name}`];
  }

  public handleMove(session: Session, direction: string): string[] {
    if (!session.player) {
      return ['You must be logged in to move.'];
    }

    const exit = this.db.findExitByDirection(session.player.currentRoomId, direction.toLowerCase());
    if (!exit) {
      return [`You can't go ${direction} from here.`];
    }

    // Update player location
    session.player.currentRoomId = exit.to_room_id;
    this.db.updatePlayerRoom(session.player.id, exit.to_room_id);

    // Return the look result for the new room
    return this.handleLook(session);
  }

  public close(): void {
    this.db.close();
  }
}