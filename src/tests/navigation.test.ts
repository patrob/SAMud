import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandDispatcher } from '../commands/commandDispatcher';
import { Session, SessionState } from '../server/session';
import { SessionManager } from '../server/sessionManager';
import { MudDatabase } from '../database/db';
import { User } from '../models/user';
import { Player } from '../models/player';
import { Room } from '../models/room';
import { registerWorldCommands } from '../commands/worldCommands';
import { seedSync } from '../database/seed';
import { Socket } from 'net';
import fs from 'fs';

/**
 * Navigation and Movement Behavioral Tests
 *
 * These tests focus on the complete user experience of navigation in the SAMud MUD game.
 * They test end-to-end movement workflows including:
 * - Player movement between rooms with proper state updates
 * - Look command showing room descriptions, exits, and other players
 * - Where command showing current location
 * - Movement restrictions and validations
 * - Direction shortcuts and aliases
 * - Multi-user movement announcements
 * - Database persistence of player locations
 *
 * Tests should FAIL initially as they test behavior that may not be fully implemented.
 */

// Mock session factory for behavioral testing
function createMockAuthenticatedSession(sessionId: string, userId: number, username: string, roomId: number = 1): Session {
  const mockSocket = {
    writable: true,
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    remoteAddress: '127.0.0.1'
  } as unknown as Socket;

  const session = new Session(mockSocket);

  // Override methods for testing
  session.writeLine = vi.fn();
  session.write = vi.fn();
  session.prompt = vi.fn();
  session.disconnect = vi.fn();

  // Set session state
  session.id = sessionId;
  session.state = SessionState.AUTHENTICATED;
  session.userId = userId;
  session.username = username;
  session.roomId = roomId;

  return session;
}

describe('Navigation and Movement Behaviors', () => {
  let dispatcher: CommandDispatcher;
  let sessionManager: SessionManager;
  let testDbPath: string;
  let userModel: User;
  let playerModel: Player;
  let roomModel: Room;

  beforeEach(async () => {
    testDbPath = './test-navigation.db';

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize test database and models
    MudDatabase.getInstance(testDbPath);
    userModel = new User();
    playerModel = new Player();
    roomModel = new Room();

    // Seed the database with San Antonio locations
    seedSync();

    // Set up dispatcher and session manager
    dispatcher = new CommandDispatcher();
    sessionManager = new SessionManager();

    // Mock the broadcast methods for testing
    sessionManager.broadcastToRoom = vi.fn();
    sessionManager.broadcast = vi.fn();
    sessionManager.broadcastToAuthenticated = vi.fn();

    // Register world commands (the actual implementation)
    registerWorldCommands(dispatcher, sessionManager);
  });

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Movement Success Behaviors', () => {
    it('should move player north from Alamo Plaza to River Walk North and update all state', async () => {
      // Create test user and player for this test
      const userId = await userModel.create('moveplayer1', 'password123');
      await playerModel.create(userId, 1);

      const session = createMockAuthenticatedSession('session-1', userId, 'moveplayer1', 1);
      sessionManager.add(session);

      // Execute move north command
      await dispatcher.dispatch(session, 'move north');

      // Should announce departure to current room (Alamo Plaza)
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'moveplayer1 goes north.',
        session.id
      );

      // Session state should be updated to new room
      expect(session.roomId).toBe(2); // River Walk North

      // Should announce arrival to new room
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        2,
        'moveplayer1 arrives from the south.',
        session.id
      );

      // Should show movement message to player
      expect(session.writeLine).toHaveBeenCalledWith('\r\nYou go north.\r\n');

      // Should automatically show new room via look command
      expect(session.writeLine).toHaveBeenCalledWith('\r\nRiver Walk North');
      expect(session.writeLine).toHaveBeenCalledWith(expect.stringContaining('The water glistens as barges float past'));

      // Verify database was updated
      const player = await playerModel.findByUserId(userId);
      expect(player?.room_id).toBe(2);
    });

    it('should move player east from Alamo Plaza and properly handle bidirectional exits', async () => {
      const session = createMockAuthenticatedSession('session-2', 1, 'testplayer1', 1);
      sessionManager.add(session);

      // Move east from Alamo Plaza to River Walk North
      await dispatcher.dispatch(session, 'move east');

      expect(session.roomId).toBe(2);
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'testplayer1 goes east.',
        session.id
      );
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        2,
        'testplayer1 arrives from the west.',
        session.id
      );
    });

    it('should handle complex movement path through multiple San Antonio locations', async () => {
      const session = createMockAuthenticatedSession('session-3', 1, 'testplayer1', 1);
      sessionManager.add(session);

      // Start at Alamo Plaza, go to River Walk South, then to Tower of Americas
      await dispatcher.dispatch(session, 'move south');
      expect(session.roomId).toBe(3); // River Walk South

      await dispatcher.dispatch(session, 'move east');
      expect(session.roomId).toBe(5); // Tower of the Americas

      // Verify each move was announced properly
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'testplayer1 goes south.',
        session.id
      );
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        3,
        'testplayer1 goes east.',
        session.id
      );
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        5,
        'testplayer1 arrives from the west.',
        session.id
      );

      // Verify final database state
      const player = await playerModel.findByUserId(1);
      expect(player?.room_id).toBe(5);
    });
  });

  describe('Look Command Behaviors', () => {
    it('should show complete room information with description, exits, and other players', async () => {
      const session1 = createMockAuthenticatedSession('session-4a', 1, 'testplayer1', 2);
      const session2 = createMockAuthenticatedSession('session-4b', 2, 'testplayer2', 2);
      sessionManager.add(session1);
      sessionManager.add(session2);

      // Execute look command in River Walk North (room 2)
      await dispatcher.dispatch(session1, 'look');

      // Should show room name
      expect(session1.writeLine).toHaveBeenCalledWith('\r\nRiver Walk North');

      // Should show room description
      expect(session1.writeLine).toHaveBeenCalledWith(
        'The water glistens as barges float past. Cafes line the banks. Mariachi music echoes from nearby restaurants.'
      );

      // Should show available exits (west to Alamo Plaza, south to River Walk South, north to Pearl)
      expect(session1.writeLine).toHaveBeenCalledWith(expect.stringMatching(/Exits: .*west.*south.*north/));

      // Should show other players in room
      expect(session1.writeLine).toHaveBeenCalledWith('Players here: testplayer2');

      // Should end with blank line
      expect(session1.writeLine).toHaveBeenCalledWith('');
    });

    it('should show "none" when no other players are in room', async () => {
      const session = createMockAuthenticatedSession('session-5', 1, 'testplayer1', 1);
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'look');

      expect(session.writeLine).toHaveBeenCalledWith('Players here: none');
    });

    it('should show "none" when no exits are available from a room', async () => {
      // Create a test room with no exits
      const db = MudDatabase.getInstance().getDb();
      db.prepare('INSERT INTO rooms (id, name, description) VALUES (?, ?, ?)').run(
        99, 'Dead End Room', 'A room with no exits for testing.'
      );

      const session = createMockAuthenticatedSession('session-6', 1, 'testplayer1', 99);
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'look');

      expect(session.writeLine).toHaveBeenCalledWith('Exits: none');
    });

    it('should filter out current player from players list', async () => {
      const session1 = createMockAuthenticatedSession('session-7a', 1, 'testplayer1', 1);
      const session2 = createMockAuthenticatedSession('session-7b', 2, 'testplayer2', 1);
      const session3 = createMockAuthenticatedSession('session-7c', 3, 'testplayer3', 1);
      sessionManager.add(session1);
      sessionManager.add(session2);
      sessionManager.add(session3);

      await dispatcher.dispatch(session1, 'look');

      // Should show other players but not self
      expect(session1.writeLine).toHaveBeenCalledWith('Players here: testplayer2, testplayer3');
    });
  });

  describe('Where Command Behaviors', () => {
    it('should show current location name and room ID', async () => {
      const session = createMockAuthenticatedSession('session-8', 1, 'testplayer1', 1);
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'where');

      expect(session.writeLine).toHaveBeenCalledWith('Current location: The Alamo Plaza (Room #1)');
    });

    it('should work correctly in different San Antonio locations', async () => {
      const session = createMockAuthenticatedSession('session-9', 1, 'testplayer1', 4);
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'where');

      expect(session.writeLine).toHaveBeenCalledWith('Current location: The Pearl (Room #4)');
    });

    it('should handle unknown room gracefully', async () => {
      const session = createMockAuthenticatedSession('session-10', 1, 'testplayer1', 999);
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'where');

      expect(session.writeLine).toHaveBeenCalledWith('Current location: Unknown');
    });
  });

  describe('Movement Restrictions and Validations', () => {
    it('should reject movement in invalid directions', async () => {
      const session = createMockAuthenticatedSession('session-11', 1, 'testplayer1', 1);
      sessionManager.add(session);

      // Try to go west from Alamo Plaza (no exit)
      await dispatcher.dispatch(session, 'move west');

      expect(session.writeLine).toHaveBeenCalledWith('You cannot go west from here.');
      expect(session.roomId).toBe(1); // Should remain in original room
    });

    it('should reject movement without direction', async () => {
      const session = createMockAuthenticatedSession('session-12', 1, 'testplayer1', 1);
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'move');

      expect(session.writeLine).toHaveBeenCalledWith('Move where? Specify a direction (n, s, e, w, etc.)');
      expect(session.roomId).toBe(1);
    });

    it('should require authentication for movement commands', async () => {
      const session = createMockAuthenticatedSession('session-13', 1, 'testplayer1', 1);
      session.state = SessionState.CONNECTED; // Not authenticated
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'move north');

      expect(session.writeLine).toHaveBeenCalledWith('You must be logged in to move.');
    });

    it('should require authentication for look command', async () => {
      const session = createMockAuthenticatedSession('session-14', 1, 'testplayer1', 1);
      session.state = SessionState.CONNECTED;
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'look');

      expect(session.writeLine).toHaveBeenCalledWith('You must be logged in to look around.');
    });

    it('should require authentication for where command', async () => {
      const session = createMockAuthenticatedSession('session-15', 1, 'testplayer1', 1);
      session.state = SessionState.CONNECTED;
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'where');

      expect(session.writeLine).toHaveBeenCalledWith('You must be logged in to see your location.');
    });

    it('should handle player with no room assignment', async () => {
      const session = createMockAuthenticatedSession('session-16', 1, 'testplayer1', 1);
      session.roomId = undefined;
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'move north');
      expect(session.writeLine).toHaveBeenCalledWith('You are not in any room.');

      await dispatcher.dispatch(session, 'look');
      expect(session.writeLine).toHaveBeenCalledWith('You are not in any room.');

      await dispatcher.dispatch(session, 'where');
      expect(session.writeLine).toHaveBeenCalledWith('You are not in any room.');
    });
  });

  describe('Direction Shortcuts and Aliases', () => {
    it('should accept single letter direction shortcuts', async () => {
      const session = createMockAuthenticatedSession('session-17', 1, 'testplayer1', 1);
      sessionManager.add(session);

      // Test all basic shortcuts
      await dispatcher.dispatch(session, 'n'); // north
      expect(session.roomId).toBe(2); // Should move to River Walk North
    });

    it('should handle all directional shortcuts correctly', async () => {
      const session = createMockAuthenticatedSession('session-18', 1, 'testplayer1', 2);
      sessionManager.add(session);

      // Test south shortcut
      await dispatcher.dispatch(session, 's');
      expect(session.roomId).toBe(3); // Should move to River Walk South

      // Reset position and test west shortcut
      session.roomId = 2;
      await dispatcher.dispatch(session, 'w');
      expect(session.roomId).toBe(1); // Should move to Alamo Plaza

      // Test east shortcut
      await dispatcher.dispatch(session, 'e');
      expect(session.roomId).toBe(2); // Should move back to River Walk North
    });

    it('should normalize direction case insensitivity', async () => {
      const session = createMockAuthenticatedSession('session-19', 1, 'testplayer1', 1);
      sessionManager.add(session);

      // Test uppercase directions
      await dispatcher.dispatch(session, 'move NORTH');
      expect(session.roomId).toBe(2);

      // Test mixed case
      session.roomId = 1;
      await dispatcher.dispatch(session, 'move NoRtH');
      expect(session.roomId).toBe(2);
    });

    it('should handle shortcut commands with proper movement flow', async () => {
      const session = createMockAuthenticatedSession('session-20', 1, 'testplayer1', 1);
      sessionManager.add(session);

      // Use shortcut and verify full movement behavior
      await dispatcher.dispatch(session, 'n');

      // Should show movement message
      expect(session.writeLine).toHaveBeenCalledWith('\r\nYou go north.\r\n');

      // Should auto-look at new room
      expect(session.writeLine).toHaveBeenCalledWith('\r\nRiver Walk North');
    });
  });

  describe('Multi-User Movement Behaviors', () => {
    it('should announce player departure to all other players in source room', async () => {
      const movingPlayer = createMockAuthenticatedSession('session-21a', 1, 'mover', 1);
      const observer1 = createMockAuthenticatedSession('session-21b', 2, 'observer1', 1);
      const observer2 = createMockAuthenticatedSession('session-21c', 3, 'observer2', 1);
      const distantPlayer = createMockAuthenticatedSession('session-21d', 4, 'distant', 2);

      sessionManager.add(movingPlayer);
      sessionManager.add(observer1);
      sessionManager.add(observer2);
      sessionManager.add(distantPlayer);

      await dispatcher.dispatch(movingPlayer, 'move north');

      // Should broadcast departure to room 1, excluding the moving player
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'mover goes north.',
        movingPlayer.id
      );

      // Should not broadcast to players in other rooms
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalledWith(
        2,
        expect.stringContaining('goes north'),
        expect.anything()
      );
    });

    it('should announce player arrival to all players in destination room', async () => {
      const movingPlayer = createMockAuthenticatedSession('session-22a', 1, 'arrival_mover', 1);
      const waitingPlayer1 = createMockAuthenticatedSession('session-22b', 2, 'waiter1', 2);
      const waitingPlayer2 = createMockAuthenticatedSession('session-22c', 3, 'waiter2', 2);

      sessionManager.add(movingPlayer);
      sessionManager.add(waitingPlayer1);
      sessionManager.add(waitingPlayer2);

      await dispatcher.dispatch(movingPlayer, 'move north');

      // Should broadcast arrival to room 2, excluding the arriving player
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        2,
        'arrival_mover arrives from the south.',
        movingPlayer.id
      );
    });

    it('should handle movement between rooms with different player populations', async () => {
      // Set up room with multiple players
      const mover = createMockAuthenticatedSession('session-23a', 1, 'explorer', 3);
      const crowd1 = createMockAuthenticatedSession('session-23b', 2, 'crowd1', 3);
      const crowd2 = createMockAuthenticatedSession('session-23c', 3, 'crowd2', 3);

      sessionManager.add(mover);
      sessionManager.add(crowd1);
      sessionManager.add(crowd2);

      // Move to empty room
      await dispatcher.dispatch(mover, 'move east');

      // Should announce departure to crowded room
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        3,
        'explorer goes east.',
        mover.id
      );

      // Should announce arrival to empty room (even though no one there)
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        5,
        'explorer arrives from the west.',
        mover.id
      );
    });

    it('should properly track multiple players moving simultaneously', async () => {
      const player1 = createMockAuthenticatedSession('session-24a', 1, 'racer1', 1);
      const player2 = createMockAuthenticatedSession('session-24b', 2, 'racer2', 1);
      const observer = createMockAuthenticatedSession('session-24c', 3, 'watcher', 1);

      sessionManager.add(player1);
      sessionManager.add(player2);
      sessionManager.add(observer);

      // Both players move at the same time
      await Promise.all([
        dispatcher.dispatch(player1, 'move north'),
        dispatcher.dispatch(player2, 'move south')
      ]);

      // Both movements should be announced
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'racer1 goes north.',
        player1.id
      );
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'racer2 goes south.',
        player2.id
      );

      // Players should end up in different rooms
      expect(player1.roomId).toBe(2);
      expect(player2.roomId).toBe(3);
    });
  });

  describe('Room Persistence and Database Updates', () => {
    it('should persist player location changes to database immediately', async () => {
      const session = createMockAuthenticatedSession('session-25', 1, 'persistent_player', 1);
      sessionManager.add(session);

      // Move player
      await dispatcher.dispatch(session, 'move north');

      // Verify database was updated
      const player = await playerModel.findByUserId(1);
      expect(player?.room_id).toBe(2);

      // Move again
      await dispatcher.dispatch(session, 'move south');

      // Verify database reflects second move
      const updatedPlayer = await playerModel.findByUserId(1);
      expect(updatedPlayer?.room_id).toBe(3);
    });

    it('should handle database update failures gracefully', async () => {
      const session = createMockAuthenticatedSession('session-26', 1, 'db_fail_player', 1);
      sessionManager.add(session);

      // Mock database failure
      const originalUpdate = playerModel.updateRoom;
      playerModel.updateRoom = vi.fn().mockRejectedValue(new Error('Database connection failed'));

      await dispatcher.dispatch(session, 'move north');

      // Player should still move in session state despite DB failure
      expect(session.roomId).toBe(2);

      // Should announce movement despite DB error
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'db_fail_player goes north.',
        session.id
      );

      // Restore original method
      playerModel.updateRoom = originalUpdate;
    });

    it('should maintain data consistency between session state and database', async () => {
      const session = createMockAuthenticatedSession('session-27', 1, 'consistency_player', 4);
      sessionManager.add(session);

      // Update player location in database first
      await playerModel.updateRoom(1, 4);

      // Verify look command uses session room state
      await dispatcher.dispatch(session, 'look');
      expect(session.writeLine).toHaveBeenCalledWith('\r\nThe Pearl');

      // Move player and verify consistency
      await dispatcher.dispatch(session, 'move south');
      expect(session.roomId).toBe(2);

      const dbPlayer = await playerModel.findByUserId(1);
      expect(dbPlayer?.room_id).toBe(2);
    });

    it('should handle players without database user ID gracefully', async () => {
      const session = createMockAuthenticatedSession('session-28', 1, 'no_user_id', 1);
      session.userId = undefined; // Remove user ID
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'move north');

      // Should still move in session state
      expect(session.roomId).toBe(2);

      // Should announce movement
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'no_user_id goes north.',
        session.id
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle movement to non-existent destination room', async () => {
      // Create exit to non-existent room
      const db = MudDatabase.getInstance().getDb();
      db.prepare('INSERT INTO exits (from_room_id, to_room_id, direction) VALUES (?, ?, ?)').run(
        1, 999, 'northeast'
      );

      const session = createMockAuthenticatedSession('session-29', 1, 'edge_case_player', 1);
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'move northeast');

      expect(session.writeLine).toHaveBeenCalledWith('That exit leads nowhere.');
      expect(session.roomId).toBe(1); // Should remain in original room
    });

    it('should handle look command in non-existent room', async () => {
      const session = createMockAuthenticatedSession('session-30', 1, 'nowhere_player', 999);
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'look');

      expect(session.writeLine).toHaveBeenCalledWith('This room does not exist.');
    });

    it('should handle database query failures during movement', async () => {
      const session = createMockAuthenticatedSession('session-31', 1, 'query_fail_player', 1);
      sessionManager.add(session);

      // Mock room model failure
      const originalGetExit = Room.prototype.getExitByDirection;
      Room.prototype.getExitByDirection = vi.fn().mockRejectedValue(new Error('Query failed'));

      await dispatcher.dispatch(session, 'move north');

      // Should handle error gracefully (exact behavior depends on implementation)
      expect(session.roomId).toBe(1); // Should remain in original room

      // Restore original method
      Room.prototype.getExitByDirection = originalGetExit;
    });

    it('should handle complex San Antonio location names and descriptions properly', async () => {
      const session = createMockAuthenticatedSession('session-32', 1, 'tourist', 6);
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'look');

      // Should display full location name
      expect(session.writeLine).toHaveBeenCalledWith('\r\nMission San Jose');

      // Should display complete description
      expect(session.writeLine).toHaveBeenCalledWith(
        'The Queen of the Missions stands majestically. Stone archways frame the courtyard. The rose window catches the light beautifully.'
      );
    });

    it('should maintain proper exit directionality and opposites', async () => {
      const session = createMockAuthenticatedSession('session-33', 1, 'direction_test', 7);
      sessionManager.add(session);

      // Move north from Southtown to River Walk South
      await dispatcher.dispatch(session, 'move north');
      expect(session.roomId).toBe(3);

      // Verify arrival message shows correct opposite direction
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        3,
        'direction_test arrives from the south.',
        session.id
      );

      // Move east to Tower of Americas
      await dispatcher.dispatch(session, 'move east');
      expect(session.roomId).toBe(5);

      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        5,
        'direction_test arrives from the west.',
        session.id
      );
    });
  });

  describe('Integration with Full MUD Experience', () => {
    it('should integrate movement with complete room experience including player tracking', async () => {
      const explorer = createMockAuthenticatedSession('session-34', 1, 'explorer', 1);
      const native1 = createMockAuthenticatedSession('session-34b', 2, 'native1', 2);
      const native2 = createMockAuthenticatedSession('session-34c', 3, 'native2', 2);

      sessionManager.add(explorer);
      sessionManager.add(native1);
      sessionManager.add(native2);

      // Look at starting room
      await dispatcher.dispatch(explorer, 'look');
      expect(explorer.writeLine).toHaveBeenCalledWith('Players here: none');

      // Move to room with other players
      await dispatcher.dispatch(explorer, 'move north');

      // Auto-look should show other players
      expect(explorer.writeLine).toHaveBeenCalledWith('Players here: native1, native2');

      // Where command should confirm location
      await dispatcher.dispatch(explorer, 'where');
      expect(explorer.writeLine).toHaveBeenCalledWith('Current location: River Walk North (Room #2)');
    });

    it('should support full tour of San Antonio landmarks with proper connectivity', async () => {
      const tourist = createMockAuthenticatedSession('session-35', 1, 'tourist', 1);
      sessionManager.add(tourist);

      const tourRoute = [
        { command: 'south', expectedRoom: 3, location: 'River Walk South' },
        { command: 'south', expectedRoom: 7, location: 'Southtown' },
        { command: 'south', expectedRoom: 6, location: 'Mission San Jose' },
        { command: 'north', expectedRoom: 7, location: 'Southtown' },
        { command: 'east', expectedRoom: 5, location: 'Tower of the Americas' },
        { command: 'west', expectedRoom: 3, location: 'River Walk South' },
        { command: 'north', expectedRoom: 1, location: 'The Alamo Plaza' }
      ];

      for (const step of tourRoute) {
        await dispatcher.dispatch(tourist, `move ${step.command}`);
        expect(tourist.roomId).toBe(step.expectedRoom);

        // Verify look shows correct location
        await dispatcher.dispatch(tourist, 'look');
        expect(tourist.writeLine).toHaveBeenCalledWith(`\r\n${step.location}`);
      }
    });
  });
});