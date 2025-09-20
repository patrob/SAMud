import { MudDatabase } from '../database/db';

export interface RoomData {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface ExitData {
  id: number;
  from_room_id: number;
  to_room_id: number;
  direction: string;
  created_at: string;
}

export class Room {
  private db: MudDatabase;

  constructor() {
    this.db = MudDatabase.getInstance();
  }

  async findById(id: number): Promise<RoomData | null> {
    const stmt = this.db.getDb().prepare(
      'SELECT * FROM rooms WHERE id = ?'
    );

    const room = stmt.get(id) as RoomData | undefined;
    return room || null;
  }

  async getAllRooms(): Promise<RoomData[]> {
    const stmt = this.db.getDb().prepare(
      'SELECT * FROM rooms ORDER BY id'
    );

    return stmt.all() as RoomData[];
  }

  async getExitsFromRoom(roomId: number): Promise<ExitData[]> {
    const stmt = this.db.getDb().prepare(
      'SELECT * FROM exits WHERE from_room_id = ? ORDER BY direction'
    );

    return stmt.all(roomId) as ExitData[];
  }

  async getExitByDirection(roomId: number, direction: string): Promise<ExitData | null> {
    const stmt = this.db.getDb().prepare(
      'SELECT * FROM exits WHERE from_room_id = ? AND direction = ? COLLATE NOCASE'
    );

    const exit = stmt.get(roomId, direction) as ExitData | undefined;
    return exit || null;
  }

  async getRoomWithExits(roomId: number): Promise<{ room: RoomData; exits: ExitData[] } | null> {
    const room = await this.findById(roomId);
    if (!room) {
      return null;
    }

    const exits = await this.getExitsFromRoom(roomId);
    return { room, exits };
  }

  getDirectionOpposite(direction: string): string {
    const opposites: { [key: string]: string } = {
      'north': 'south',
      'south': 'north',
      'east': 'west',
      'west': 'east',
      'northeast': 'southwest',
      'northwest': 'southeast',
      'southeast': 'northwest',
      'southwest': 'northeast',
      'up': 'down',
      'down': 'up'
    };

    return opposites[direction.toLowerCase()] || direction;
  }

  getDirectionShortcuts(): { [key: string]: string } {
    return {
      'n': 'north',
      'north': 'north',
      's': 'south',
      'south': 'south',
      'e': 'east',
      'east': 'east',
      'w': 'west',
      'west': 'west',
      'ne': 'northeast',
      'northeast': 'northeast',
      'nw': 'northwest',
      'northwest': 'northwest',
      'se': 'southeast',
      'southeast': 'southeast',
      'sw': 'southwest',
      'southwest': 'southwest',
      'u': 'up',
      'up': 'up',
      'd': 'down',
      'down': 'down'
    };
  }
}