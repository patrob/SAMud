import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Room } from '../models/room';
import { MudDatabase } from '../database/db';
import fs from 'fs';

describe('Room Model', () => {
  let room: Room;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = './test-mud.db';

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize with test database
    const db = MudDatabase.getInstance(testDbPath);

    // Insert test data
    const dbInstance = db.getDb();
    dbInstance.prepare(`
      INSERT INTO rooms (id, name, description) VALUES
      (1, 'Test Room 1', 'A test room'),
      (2, 'Test Room 2', 'Another test room')
    `).run();

    dbInstance.prepare(`
      INSERT INTO exits (from_room_id, to_room_id, direction) VALUES
      (1, 2, 'north'),
      (2, 1, 'south')
    `).run();

    room = new Room();
  });

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should find room by id', async () => {
    const foundRoom = await room.findById(1);

    expect(foundRoom).toBeTruthy();
    expect(foundRoom?.id).toBe(1);
    expect(foundRoom?.name).toBe('Test Room 1');
    expect(foundRoom?.description).toBe('A test room');
  });

  it('should return null for non-existent room', async () => {
    const foundRoom = await room.findById(999);
    expect(foundRoom).toBeNull();
  });

  it('should get exits from room', async () => {
    const exits = await room.getExitsFromRoom(1);

    expect(exits).toHaveLength(1);
    expect(exits[0].direction).toBe('north');
    expect(exits[0].to_room_id).toBe(2);
  });

  it('should find exit by direction', async () => {
    const exit = await room.getExitByDirection(1, 'north');

    expect(exit).toBeTruthy();
    expect(exit?.to_room_id).toBe(2);
  });

  it('should handle case-insensitive directions', async () => {
    const exit = await room.getExitByDirection(1, 'NORTH');

    expect(exit).toBeTruthy();
    expect(exit?.to_room_id).toBe(2);
  });

  it('should return null for non-existent exit', async () => {
    const exit = await room.getExitByDirection(1, 'west');
    expect(exit).toBeNull();
  });

  it('should get room with exits', async () => {
    const roomWithExits = await room.getRoomWithExits(1);

    expect(roomWithExits).toBeTruthy();
    expect(roomWithExits?.room.id).toBe(1);
    expect(roomWithExits?.exits).toHaveLength(1);
  });

  it('should convert direction shortcuts correctly', () => {
    const shortcuts = room.getDirectionShortcuts();

    expect(shortcuts['n']).toBe('north');
    expect(shortcuts['s']).toBe('south');
    expect(shortcuts['e']).toBe('east');
    expect(shortcuts['w']).toBe('west');
    expect(shortcuts['north']).toBe('north'); // Full names should map to themselves
  });

  it('should get opposite directions correctly', () => {
    expect(room.getDirectionOpposite('north')).toBe('south');
    expect(room.getDirectionOpposite('south')).toBe('north');
    expect(room.getDirectionOpposite('east')).toBe('west');
    expect(room.getDirectionOpposite('west')).toBe('east');
  });
});