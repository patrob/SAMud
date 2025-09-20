import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { seedSync } from './seed';

export class MudDatabase {
  private db: Database.Database;
  private static instance: MudDatabase | null = null;

  constructor(dbPath: string = process.env.DB_PATH || './mud.db') {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  static getInstance(dbPath?: string): MudDatabase {
    if (!MudDatabase.instance) {
      MudDatabase.instance = new MudDatabase(dbPath);
      MudDatabase.instance.init();
    }
    return MudDatabase.instance;
  }

  init() {
    this.runMigrations();
    this.runSeeding();
  }

  private runMigrations() {
    // Create migrations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrations = [
      {
        name: '001_create_users',
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
          )
        `
      },
      {
        name: '002_create_players',
        sql: `
          CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            room_id INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `
      },
      {
        name: '003_create_rooms',
        sql: `
          CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `
      },
      {
        name: '004_create_exits',
        sql: `
          CREATE TABLE IF NOT EXISTS exits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_room_id INTEGER NOT NULL,
            to_room_id INTEGER NOT NULL,
            direction TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (from_room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            FOREIGN KEY (to_room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            UNIQUE(from_room_id, direction)
          )
        `
      }
    ];

    const appliedMigrations = this.db.prepare('SELECT name FROM migrations').all() as { name: string }[];
    const appliedNames = new Set(appliedMigrations.map(m => m.name));

    for (const migration of migrations) {
      if (!appliedNames.has(migration.name)) {
        console.log(`Running migration: ${migration.name}`);
        this.db.exec(migration.sql);
        this.db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
      }
    }
  }

  private runSeeding() {
    // Check if rooms already exist (avoid re-seeding)
    const roomCount = this.db.prepare('SELECT COUNT(*) as count FROM rooms').get() as { count: number };

    if (roomCount.count === 0) {
      console.log('No rooms found, running initial seed...');
      // Run seeding synchronously since this is during initialization
      try {
        seedSync();
        console.log('Initial seeding completed');
      } catch (error) {
        console.error('Failed to run initial seeding:', error);
      }
    }
  }

  getDb(): Database.Database {
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      MudDatabase.instance = null;
    }
  }
}