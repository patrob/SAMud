// Database layer - SQLite operations

import Database from 'better-sqlite3';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import * as fs from 'fs';
import { Player } from '../types';

export class DatabaseManager {
  private db: Database.Database;
  private readonly saltRounds = 10;

  constructor(dbPath: string = 'data/samud.db') {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    console.log('Initializing database...');
    
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    this.runMigrations();
    console.log('Database ready');
  }

  private runMigrations(): void {
    // Create users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `);

    // Create players table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        current_room_id INTEGER DEFAULT 1,
        last_save DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Create rooms table (will populate in Phase 4)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL
      )
    `);

    // Create exits table (will populate in Phase 4)  
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_room_id INTEGER NOT NULL,
        to_room_id INTEGER NOT NULL,
        direction TEXT NOT NULL,
        short_direction TEXT NOT NULL,
        FOREIGN KEY (from_room_id) REFERENCES rooms (id),
        FOREIGN KEY (to_room_id) REFERENCES rooms (id)
      )
    `);
  }

  public async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.saltRounds);
  }

  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  public createUser(username: string, passwordHash: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO users (username, password_hash)
      VALUES (?, ?)
    `);
    
    try {
      const result = stmt.run(username, passwordHash);
      return result.lastInsertRowid as number;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Username already exists');
      }
      throw error;
    }
  }

  public createPlayer(userId: number): number {
    const stmt = this.db.prepare(`
      INSERT INTO players (user_id, current_room_id)
      VALUES (?, 1)
    `);
    
    const result = stmt.run(userId);
    return result.lastInsertRowid as number;
  }

  public getUser(username: string): { id: number; username: string; password_hash: string } | null {
    const stmt = this.db.prepare(`
      SELECT id, username, password_hash
      FROM users
      WHERE username = ?
    `);
    
    return stmt.get(username) as { id: number; username: string; password_hash: string } | null;
  }

  public getPlayer(userId: number): Player | null {
    const stmt = this.db.prepare(`
      SELECT p.id, u.username, p.current_room_id as currentRoomId
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
    `);
    
    return stmt.get(userId) as Player | null;
  }

  public updatePlayerRoom(playerId: number, roomId: number): void {
    const stmt = this.db.prepare(`
      UPDATE players
      SET current_room_id = ?, last_save = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(roomId, playerId);
  }

  public updateLastLogin(userId: number): void {
    const stmt = this.db.prepare(`
      UPDATE users
      SET last_login = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(userId);
  }

  public getRoom(roomId: number): { id: number; name: string; description: string } | null {
    const stmt = this.db.prepare(`
      SELECT id, name, description
      FROM rooms
      WHERE id = ?
    `);
    
    return stmt.get(roomId) as { id: number; name: string; description: string } | null;
  }

  public getRoomExits(roomId: number): { direction: string; short_direction: string; to_room_id: number; room_name: string }[] {
    const stmt = this.db.prepare(`
      SELECT e.direction, e.short_direction, e.to_room_id, r.name as room_name
      FROM exits e
      JOIN rooms r ON e.to_room_id = r.id
      WHERE e.from_room_id = ?
    `);
    
    return stmt.all(roomId) as { direction: string; short_direction: string; to_room_id: number; room_name: string }[];
  }

  public findExitByDirection(roomId: number, direction: string): { to_room_id: number } | null {
    const stmt = this.db.prepare(`
      SELECT to_room_id
      FROM exits
      WHERE from_room_id = ? AND (direction = ? OR short_direction = ?)
    `);
    
    return stmt.get(roomId, direction, direction) as { to_room_id: number } | null;
  }

  public getPlayersInRoom(roomId: number): { username: string }[] {
    const stmt = this.db.prepare(`
      SELECT u.username
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE p.current_room_id = ?
    `);
    
    return stmt.all(roomId) as { username: string }[];
  }

  public close(): void {
    this.db.close();
  }
}