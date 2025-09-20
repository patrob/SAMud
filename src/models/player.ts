import { MudDatabase } from '../database/db';

export interface PlayerData {
  id: number;
  user_id: number;
  room_id: number;
  created_at: string;
  last_seen: string;
}

export class Player {
  private db: MudDatabase;

  constructor() {
    this.db = MudDatabase.getInstance();
  }

  async create(userId: number, roomId: number = 1): Promise<number> {
    const stmt = this.db.getDb().prepare(
      'INSERT INTO players (user_id, room_id) VALUES (?, ?)'
    );

    try {
      const result = stmt.run(userId, roomId);
      return result.lastInsertRowid as number;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Player already exists for this user');
      }
      throw error;
    }
  }

  async findByUserId(userId: number): Promise<PlayerData | null> {
    const stmt = this.db.getDb().prepare(
      'SELECT * FROM players WHERE user_id = ?'
    );

    const player = stmt.get(userId) as PlayerData | undefined;
    return player || null;
  }

  async findById(id: number): Promise<PlayerData | null> {
    const stmt = this.db.getDb().prepare(
      'SELECT * FROM players WHERE id = ?'
    );

    const player = stmt.get(id) as PlayerData | undefined;
    return player || null;
  }

  async updateRoom(userId: number, roomId: number) {
    const stmt = this.db.getDb().prepare(
      'UPDATE players SET room_id = ?, last_seen = CURRENT_TIMESTAMP WHERE user_id = ?'
    );
    stmt.run(roomId, userId);
  }

  async updateLastSeen(userId: number) {
    const stmt = this.db.getDb().prepare(
      'UPDATE players SET last_seen = CURRENT_TIMESTAMP WHERE user_id = ?'
    );
    stmt.run(userId);
  }

  async getOnlinePlayers(): Promise<Array<{ username: string; room_id: number; room_name: string }>> {
    const stmt = this.db.getDb().prepare(`
      SELECT u.username, p.room_id, r.name as room_name
      FROM players p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN rooms r ON p.room_id = r.id
      WHERE datetime(p.last_seen) > datetime('now', '-5 minutes')
      ORDER BY u.username
    `);

    return stmt.all() as Array<{ username: string; room_id: number; room_name: string }>;
  }

  async getPlayersInRoom(roomId: number): Promise<string[]> {
    const stmt = this.db.getDb().prepare(`
      SELECT u.username
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE p.room_id = ? AND datetime(p.last_seen) > datetime('now', '-5 minutes')
      ORDER BY u.username
    `);

    const players = stmt.all(roomId) as Array<{ username: string }>;
    return players.map(p => p.username);
  }
}