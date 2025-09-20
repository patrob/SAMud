import * as bcrypt from 'bcrypt';
import { MudDatabase } from '../database/db';

const SALT_ROUNDS = 10;

export interface UserData {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  last_login: string | null;
}

export class User {
  private db: MudDatabase;

  constructor() {
    this.db = MudDatabase.getInstance();
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async create(username: string, password: string): Promise<number> {
    const passwordHash = await this.hashPassword(password);

    const stmt = this.db.getDb().prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)'
    );

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

  async findByUsername(username: string): Promise<UserData | null> {
    const stmt = this.db.getDb().prepare(
      'SELECT * FROM users WHERE username = ? COLLATE NOCASE'
    );

    const user = stmt.get(username) as UserData | undefined;
    return user || null;
  }

  async findById(id: number): Promise<UserData | null> {
    const stmt = this.db.getDb().prepare(
      'SELECT * FROM users WHERE id = ?'
    );

    const user = stmt.get(id) as UserData | undefined;
    return user || null;
  }

  async authenticate(username: string, password: string): Promise<UserData | null> {
    const user = await this.findByUsername(username);

    if (!user) {
      return null;
    }

    const isValid = await this.verifyPassword(password, user.password_hash);

    if (!isValid) {
      return null;
    }

    // Update last login time
    this.db.getDb().prepare(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(user.id);

    return user;
  }

  async updateLastLogin(userId: number) {
    const stmt = this.db.getDb().prepare(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'
    );
    stmt.run(userId);
  }
}