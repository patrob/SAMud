import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandDispatcher } from '../commands/commandDispatcher';
import { SessionManager } from '../server/sessionManager';
import { Session, SessionState } from '../server/session';
import { MudDatabase } from '../database/db';
import { seedSync } from '../database/seed';
import { User } from '../models/user';
import { Player } from '../models/player';
import fs from 'fs';
import { EventEmitter } from 'events';

// Mock socket for testing
class MockSocket extends EventEmitter {
  public data: string[] = [];
  public writable: boolean = true;
  public remoteAddress: string = '127.0.0.1';
  public remotePort: number = 12345;

  write(data: string): boolean {
    this.data.push(data);
    return true;
  }

  end(): void {
    this.writable = false;
    this.emit('end');
  }

  clear(): void {
    this.data = [];
  }

  getLastMessage(): string {
    return this.data[this.data.length - 1] || '';
  }

  getAllMessages(): string {
    return this.data.join('');
  }
}

describe('Presence and Social Features', () => {
  let dispatcher: CommandDispatcher;
  let sessionManager: SessionManager;
  let testDbPath: string;
  let userModel: User;
  let playerModel: Player;

  // Helper to create mock session
  function createMockSession(id: string): Session {
    const mockSocket = new MockSocket() as any; // Type assertion to Socket
    const session = new Session(mockSocket);
    session.id = id; // Override the generated ID for predictable testing
    return session;
  }

  // Helper to authenticate session
  async function authenticateSession(session: Session, username: string, password: string = 'Password123'): Promise<void> {
    // Make username unique to prevent conflicts across tests
    const uniqueUsername = `${username}_${testCounter}_${Date.now()}`;
    const userId = await userModel.create(uniqueUsername, password);
    await playerModel.create(userId, 1); // Start at Alamo Plaza

    session.userId = userId;
    session.username = uniqueUsername;
    session.roomId = 1;
    session.setState(SessionState.AUTHENTICATED);
    sessionManager.add(session);
  }

  let testCounter = 0;

  beforeEach(async () => {
    testCounter++;
    testDbPath = `./test-presence-${testCounter}.db`;

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize with test database and seed it
    MudDatabase.getInstance(testDbPath);
    seedSync();

    userModel = new User();
    playerModel = new Player();
    sessionManager = new SessionManager();
    dispatcher = new CommandDispatcher();

    // Register commands (this would normally happen in server setup)
    const { registerAuthCommands } = await import('../commands/authCommands');
    const { registerChatCommands } = await import('../commands/chatCommands');
    const { registerWorldCommands } = await import('../commands/worldCommands');
    const { registerBasicCommands } = await import('../commands/basicCommands');

    registerBasicCommands(dispatcher, sessionManager);
    registerAuthCommands(dispatcher, sessionManager);
    registerChatCommands(dispatcher, sessionManager);
    registerWorldCommands(dispatcher, sessionManager);
  });

  afterEach(() => {
    // Clean up all test database files
    const pattern = './test-presence-*.db';
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      // Clean up any sqlite auxiliary files
      if (fs.existsSync(testDbPath + '-wal')) {
        fs.unlinkSync(testDbPath + '-wal');
      }
      if (fs.existsSync(testDbPath + '-shm')) {
        fs.unlinkSync(testDbPath + '-shm');
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Who Command Behavior', () => {
    it('should show formatted list of online players with their current room locations', async () => {
      const session1 = createMockSession('session1');
      const session2 = createMockSession('session2');
      const session3 = createMockSession('session3');

      await authenticateSession(session1, 'alice');
      await authenticateSession(session2, 'bob');
      await authenticateSession(session3, 'charlie');

      // Move players to different rooms
      session2.roomId = 2; // River Walk North
      session3.roomId = 4; // The Pearl
      await playerModel.updateRoom(session2.userId!, 2);
      await playerModel.updateRoom(session3.userId!, 4);

      const queryingSession = createMockSession('querying');
      await authenticateSession(queryingSession, 'david');

      await dispatcher.dispatch(queryingSession, 'who');

      const output = (queryingSession.socket as MockSocket).getAllMessages();

      // Should show header
      expect(output).toContain('=== Online Players ===');

      // Should show all players with their locations (using actual usernames)
      expect(output).toContain(`${session1.username} - The Alamo Plaza`);
      expect(output).toContain(`${session2.username} - River Walk North`);
      expect(output).toContain(`${session3.username} - The Pearl`);
      expect(output).toContain(`${queryingSession.username} - The Alamo Plaza`);

      // Should show total count
      expect(output).toContain('Total: 4 player(s) online');
    });

    it('should handle empty online player list gracefully', async () => {
      const session = createMockSession('lonely');
      // Don't authenticate session to simulate no online players
      session.setState(SessionState.AUTHENTICATED);
      session.username = 'lonely';
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'who');

      const output = (session.socket as MockSocket).getAllMessages();
      expect(output).toContain('No players are currently online.');
    });

    it('should require authentication to use who command', async () => {
      const session = createMockSession('unauthenticated');
      // Don't authenticate

      await dispatcher.dispatch(session, 'who');

      const output = (session.socket as MockSocket).getAllMessages();
      expect(output).toContain('You must be logged in to see who is online.');
    });
  });

  describe('Player Visibility in Rooms', () => {
    it('should show other players in the same room when using look command', async () => {
      const session1 = createMockSession('session1');
      const session2 = createMockSession('session2');
      const session3 = createMockSession('session3');

      await authenticateSession(session1, 'alice');
      await authenticateSession(session2, 'bob');
      await authenticateSession(session3, 'charlie');

      // Move charlie to different room
      session3.roomId = 2; // River Walk North
      await playerModel.updateRoom(session3.userId!, 2);

      await dispatcher.dispatch(session1, 'look');

      const output = (session1.socket as MockSocket).getAllMessages();

      // Should show room details
      expect(output).toContain('The Alamo Plaza');
      expect(output).toContain('Stone walls surround you');

      // Should show bob (in same room) but not charlie (in different room)
      expect(output).toContain('Players here: bob');
      expect(output).not.toContain('charlie');
    });

    it('should exclude current player from room player list', async () => {
      const session1 = createMockSession('session1');
      const session2 = createMockSession('session2');

      await authenticateSession(session1, 'alice');
      await authenticateSession(session2, 'bob');

      await dispatcher.dispatch(session1, 'look');

      const output = (session1.socket as MockSocket).getAllMessages();

      // Should show bob but not alice (self)
      expect(output).toContain('Players here: bob');
      expect(output).not.toContain('alice');
    });

    it('should show "none" when no other players are in the room', async () => {
      const session = createMockSession('lonely');
      await authenticateSession(session, 'alice');

      await dispatcher.dispatch(session, 'look');

      const output = (session.socket as MockSocket).getAllMessages();
      expect(output).toContain('Players here: none');
    });

    it('should filter players across different San Antonio locations correctly', async () => {
      const alamoSession = createMockSession('alamo');
      const riverwalkSession = createMockSession('riverwalk');
      const pearlSession = createMockSession('pearl');

      await authenticateSession(alamoSession, 'alamo_visitor');
      await authenticateSession(riverwalkSession, 'river_walker');
      await authenticateSession(pearlSession, 'pearl_shopper');

      // Move players to specific locations
      riverwalkSession.roomId = 2; // River Walk North
      pearlSession.roomId = 4; // The Pearl
      await playerModel.updateRoom(riverwalkSession.userId!, 2);
      await playerModel.updateRoom(pearlSession.userId!, 4);

      // Check River Walk visibility
      await dispatcher.dispatch(riverwalkSession, 'look');
      const riverwalkOutput = (riverwalkSession.socket as MockSocket).getAllMessages();

      expect(riverwalkOutput).toContain('River Walk North');
      expect(riverwalkOutput).toContain('Players here: none'); // Only river_walker there
      expect(riverwalkOutput).not.toContain('alamo_visitor');
      expect(riverwalkOutput).not.toContain('pearl_shopper');
    });
  });

  describe('Join Game Announcements', () => {
    it('should broadcast join announcement to other players in room when signing up', async () => {
      const existingSession = createMockSession('existing');
      await authenticateSession(existingSession, 'alice');
      (existingSession.socket as MockSocket).clear();

      const newSession = createMockSession('newbie');

      // Simulate signup flow completion
      await dispatcher.dispatch(newSession, 'signup');
      await dispatcher.dispatch(newSession, '__auth_flow__ bob');
      await dispatcher.dispatch(newSession, '__auth_flow__ Password123');
      await dispatcher.dispatch(newSession, '__auth_flow__ Password123');

      const existingOutput = (existingSession.socket as MockSocket).getAllMessages();
      expect(existingOutput).toContain(`${newSession.username} has joined the game.`);
    });

    it('should broadcast join announcement to other players in room when logging in', async () => {
      // Create a user first
      const uniqueCharlie = `charlie_${testCounter}_${Date.now()}`;
      await userModel.create(uniqueCharlie, 'Password123');

      const existingSession = createMockSession('existing');
      await authenticateSession(existingSession, 'alice');
      (existingSession.socket as MockSocket).clear();

      const loginSession = createMockSession('login');

      // Simulate login flow
      await dispatcher.dispatch(loginSession, 'login');
      await dispatcher.dispatch(loginSession, `__auth_flow__ ${uniqueCharlie}`);
      await dispatcher.dispatch(loginSession, '__auth_flow__ Password123');

      const existingOutput = (existingSession.socket as MockSocket).getAllMessages();
      expect(existingOutput).toContain(`${uniqueCharlie} has joined the game.`);
    });

    it('should not announce to players in different rooms', async () => {
      const alamoSession = createMockSession('alamo');
      const riverwalkSession = createMockSession('riverwalk');

      await authenticateSession(alamoSession, 'alice');
      await authenticateSession(riverwalkSession, 'bob');

      // Move bob to River Walk
      riverwalkSession.roomId = 2;
      await playerModel.updateRoom(riverwalkSession.userId!, 2);

      (alamoSession.socket as MockSocket).clear();
      (riverwalkSession.socket as MockSocket).clear();

      const newSession = createMockSession('newbie');

      // New player joins at Alamo Plaza (default)
      await dispatcher.dispatch(newSession, 'signup');
      await dispatcher.dispatch(newSession, '__auth_flow__ charlie');
      await dispatcher.dispatch(newSession, '__auth_flow__ Password123');
      await dispatcher.dispatch(newSession, '__auth_flow__ Password123');

      const alamoOutput = (alamoSession.socket as MockSocket).getAllMessages();
      const riverwalkOutput = (riverwalkSession.socket as MockSocket).getAllMessages();

      // Should announce to alice (same room) but not to bob (different room)
      expect(alamoOutput).toContain(`${newSession.username} has joined the game.`);
      expect(riverwalkOutput).not.toContain(`${newSession.username} has joined the game.`);
    });
  });

  describe('Leave Game Announcements', () => {
    it('should announce when players disconnect', async () => {
      const session1 = createMockSession('session1');
      const session2 = createMockSession('session2');

      await authenticateSession(session1, 'alice');
      await authenticateSession(session2, 'bob');

      (session2.socket as MockSocket).clear();

      // Simulate disconnect by removing from session manager
      sessionManager.remove('session1');

      // This test currently fails because disconnect announcements are not implemented
      // The functionality should announce when a player disconnects
      const bobOutput = (session2.socket as MockSocket).getAllMessages();
      expect(bobOutput).toContain(`${session1.username} has left the game.`);
    });

    it('should announce when players quit using quit command', async () => {
      const session1 = createMockSession('session1');
      const session2 = createMockSession('session2');

      await authenticateSession(session1, 'alice');
      await authenticateSession(session2, 'bob');

      (session2.socket as MockSocket).clear();

      // Simulate quit command (not yet implemented)
      await dispatcher.dispatch(session1, 'quit');

      const bobOutput = (session2.socket as MockSocket).getAllMessages();
      expect(bobOutput).toContain(`${session1.username} has left the game.`);
    });
  });

  describe('Welcome Messages', () => {
    it('should display ASCII art welcome message on successful signup', async () => {
      const session = createMockSession('newbie');
      const uniqueUsername = `alice_${testCounter}_${Date.now()}`;

      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, `__auth_flow__ ${uniqueUsername}`);
      await dispatcher.dispatch(session, '__auth_flow__ Password123');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      const output = (session.socket as MockSocket).getAllMessages();

      // Should contain ASCII art for "ATC MUD"
      expect(output).toContain('█████╗  ████████╗  ██████╗');
      expect(output).toContain('███╗   ███╗ ██╗   ██╗ ██████╗');
      expect(output).toContain(`Account created. Welcome, ${uniqueUsername}!`);
      expect(output).toContain('You appear at The Alamo Plaza');
      expect(output).toContain('Type `help` for a list of commands.');
    });

    it('should display ASCII art welcome message on successful login', async () => {
      // Create user first with unique name
      const uniqueUsername = `bob_${testCounter}_${Date.now()}`;
      await userModel.create(uniqueUsername, 'Password123');

      const session = createMockSession('returning');

      await dispatcher.dispatch(session, 'login');
      await dispatcher.dispatch(session, `__auth_flow__ ${uniqueUsername}`);
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      const output = (session.socket as MockSocket).getAllMessages();

      // Should contain ASCII art
      expect(output).toContain('█████╗  ████████╗  ██████╗');
      expect(output).toContain('███╗   ███╗ ██╗   ██╗ ██████╗');
      expect(output).toContain(`Welcome back, ${uniqueUsername}!`);
      expect(output).toContain('Type `look` to see your surroundings.');
      expect(output).toContain('Type `help` for a list of commands.');
    });

    it('should not display welcome message on failed authentication', async () => {
      const session = createMockSession('failed');

      await dispatcher.dispatch(session, 'login');
      await dispatcher.dispatch(session, '__auth_flow__ nonexistent');
      await dispatcher.dispatch(session, '__auth_flow__ wrongpassword');

      const output = (session.socket as MockSocket).getAllMessages();

      // Should not contain ASCII art
      expect(output).not.toContain('█████╗  ████████╗  ██████╗');
      expect(output).toContain('Invalid username or password.');
    });
  });

  describe('Multi-Room Presence', () => {
    it('should track players distributed across different San Antonio locations', async () => {
      const alamoSession = createMockSession('alamo');
      const riverwalkSession = createMockSession('riverwalk');
      const pearlSession = createMockSession('pearl');
      const towersSession = createMockSession('tower');
      const missionSession = createMockSession('mission');

      await authenticateSession(alamoSession, 'tourist1');
      await authenticateSession(riverwalkSession, 'tourist2');
      await authenticateSession(pearlSession, 'shopper');
      await authenticateSession(towersSession, 'sightseer');
      await authenticateSession(missionSession, 'historian');

      // Distribute players across San Antonio locations
      riverwalkSession.roomId = 2; // River Walk North
      pearlSession.roomId = 4; // The Pearl
      towersSession.roomId = 5; // Tower of the Americas
      missionSession.roomId = 6; // Mission San Jose

      await playerModel.updateRoom(riverwalkSession.userId!, 2);
      await playerModel.updateRoom(pearlSession.userId!, 4);
      await playerModel.updateRoom(towersSession.userId!, 5);
      await playerModel.updateRoom(missionSession.userId!, 6);

      // Check global who command shows all locations
      await dispatcher.dispatch(alamoSession, 'who');
      const output = (alamoSession.socket as MockSocket).getAllMessages();

      expect(output).toContain(`${alamoSession.username} - The Alamo Plaza`);
      expect(output).toContain(`${riverwalkSession.username} - River Walk North`);
      expect(output).toContain(`${pearlSession.username} - The Pearl`);
      expect(output).toContain(`${towersSession.username} - Tower of the Americas`);
      expect(output).toContain(`${missionSession.username} - Mission San Jose`);
      expect(output).toContain('Total: 5 player(s) online');
    });

    it('should properly filter room-specific commands by location', async () => {
      const alamoSession1 = createMockSession('alamo1');
      const alamoSession2 = createMockSession('alamo2');
      const riverwalkSession = createMockSession('riverwalk');

      await authenticateSession(alamoSession1, 'alice');
      await authenticateSession(alamoSession2, 'bob');
      await authenticateSession(riverwalkSession, 'charlie');

      // Move charlie to River Walk
      riverwalkSession.roomId = 2;
      await playerModel.updateRoom(riverwalkSession.userId!, 2);

      (alamoSession1.socket as MockSocket).clear();
      (alamoSession2.socket as MockSocket).clear();
      (riverwalkSession.socket as MockSocket).clear();

      // Alice says something at Alamo Plaza
      await dispatcher.dispatch(alamoSession1, 'say Hello everyone!');

      const alamoBobOutput = (alamoSession2.socket as MockSocket).getAllMessages();
      const riverwalkCharlieOutput = (riverwalkSession.socket as MockSocket).getAllMessages();

      // Bob (same room) should hear, Charlie (different room) should not
      expect(alamoBobOutput).toContain(`[Room] ${alamoSession1.username} says: Hello everyone!`);
      expect(riverwalkCharlieOutput).not.toContain(`${alamoSession1.username} says`);
    });
  });

  describe('Room Population Tracking', () => {
    it('should accurately count and list players per room', async () => {
      const session1 = createMockSession('s1');
      const session2 = createMockSession('s2');
      const session3 = createMockSession('s3');
      const session4 = createMockSession('s4');

      await authenticateSession(session1, 'alice');
      await authenticateSession(session2, 'bob');
      await authenticateSession(session3, 'charlie');
      await authenticateSession(session4, 'diana');

      // Move some players to River Walk North
      session2.roomId = 2;
      session3.roomId = 2;
      await playerModel.updateRoom(session2.userId!, 2);
      await playerModel.updateRoom(session3.userId!, 2);

      // Check Alamo Plaza population
      await dispatcher.dispatch(session1, 'look');
      const alamoOutput = (session1.socket as MockSocket).getAllMessages();
      expect(alamoOutput).toContain('Players here: diana'); // Only diana with alice

      // Check River Walk population
      await dispatcher.dispatch(session2, 'look');
      const riverwalkOutput = (session2.socket as MockSocket).getAllMessages();
      expect(riverwalkOutput).toContain('Players here: charlie'); // Only charlie with bob
    });

    it('should handle dynamic room population changes', async () => {
      const session1 = createMockSession('s1');
      const session2 = createMockSession('s2');

      await authenticateSession(session1, 'alice');
      await authenticateSession(session2, 'bob');

      // Initially both at Alamo Plaza
      await dispatcher.dispatch(session1, 'look');
      let output = (session1.socket as MockSocket).getAllMessages();
      expect(output).toContain('Players here: bob');

      // Bob moves to River Walk North
      session2.roomId = 2;
      await playerModel.updateRoom(session2.userId!, 2);
      await playerModel.updateLastSeen(session2.userId!);

      (session1.socket as MockSocket).clear();

      // Now Alice should see empty room
      await dispatcher.dispatch(session1, 'look');
      output = (session1.socket as MockSocket).getAllMessages();
      expect(output).toContain('Players here: none');
    });
  });

  describe('Cross-Room Awareness', () => {
    it('should distinguish between global player list and room-specific visibility', async () => {
      const alamoSession = createMockSession('alamo');
      const riverwalkSession = createMockSession('riverwalk');

      await authenticateSession(alamoSession, 'alice');
      await authenticateSession(riverwalkSession, 'bob');

      riverwalkSession.roomId = 2;
      await playerModel.updateRoom(riverwalkSession.userId!, 2);

      // Global who command should show both players
      await dispatcher.dispatch(alamoSession, 'who');
      let output = (alamoSession.socket as MockSocket).getAllMessages();
      expect(output).toContain(`${alamoSession.username} - The Alamo Plaza`);
      expect(output).toContain(`${riverwalkSession.username} - River Walk North`);
      expect(output).toContain('Total: 2 player(s) online');

      (alamoSession.socket as MockSocket).clear();

      // Room-specific look should only show same-room players
      await dispatcher.dispatch(alamoSession, 'look');
      output = (alamoSession.socket as MockSocket).getAllMessages();
      expect(output).toContain('Players here: none'); // bob is in different room
      expect(output).not.toContain('bob');
    });

    it('should handle shout command for global communication across rooms', async () => {
      const alamoSession = createMockSession('alamo');
      const riverwalkSession = createMockSession('riverwalk');

      await authenticateSession(alamoSession, 'alice');
      await authenticateSession(riverwalkSession, 'bob');

      riverwalkSession.roomId = 2;
      await playerModel.updateRoom(riverwalkSession.userId!, 2);

      (riverwalkSession.socket as MockSocket).clear();

      // Alice shouts from Alamo Plaza
      await dispatcher.dispatch(alamoSession, 'shout Hello from the Alamo!');

      const bobOutput = (riverwalkSession.socket as MockSocket).getAllMessages();
      expect(bobOutput).toContain(`[Global] ${alamoSession.username} shouts: Hello from the Alamo!`);
    });
  });

  describe('Session State Tracking', () => {
    it('should tie online status to authentication state, not just connection', async () => {
      const authenticatedSession = createMockSession('auth');
      const unauthenticatedSession = createMockSession('unauth');

      await authenticateSession(authenticatedSession, 'alice');

      // Add unauthenticated session to manager (connected but not logged in)
      sessionManager.add(unauthenticatedSession);

      await dispatcher.dispatch(authenticatedSession, 'who');
      const output = (authenticatedSession.socket as MockSocket).getAllMessages();

      // Should only show authenticated players
      expect(output).toContain(`${authenticatedSession.username} - The Alamo Plaza`);
      expect(output).toContain('Total: 1 player(s) online');
      expect(output).not.toContain('unauth');
    });

    it('should exclude players who are in authentication flow from presence', async () => {
      const authenticatedSession = createMockSession('auth');
      const signingUpSession = createMockSession('signup');

      await authenticateSession(authenticatedSession, 'alice');

      // Start signup flow but don't complete it
      await dispatcher.dispatch(signingUpSession, 'signup');
      sessionManager.add(signingUpSession);

      await dispatcher.dispatch(authenticatedSession, 'who');
      const output = (authenticatedSession.socket as MockSocket).getAllMessages();

      // Should only show fully authenticated players
      expect(output).toContain(`${authenticatedSession.username} - The Alamo Plaza`);
      expect(output).toContain('Total: 1 player(s) online');
    });
  });

  describe('Presence Persistence', () => {
    it('should maintain player locations across login sessions', async () => {
      // Create user and set their location to The Pearl
      const uniqueAlice = `alice_${testCounter}_${Date.now()}`;
      const userId = await userModel.create(uniqueAlice, 'Password123');
      await playerModel.create(userId, 4); // The Pearl

      const session = createMockSession('returning');

      // Simulate login
      await dispatcher.dispatch(session, 'login');
      await dispatcher.dispatch(session, `__auth_flow__ ${uniqueAlice}`);
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      // Should return to The Pearl, not default Alamo Plaza
      expect(session.roomId).toBe(4);

      await dispatcher.dispatch(session, 'where');
      const output = (session.socket as MockSocket).getAllMessages();
      expect(output).toContain('Current location: The Pearl (Room #4)');
    });

    it('should update last seen timestamp for presence tracking', async () => {
      const session = createMockSession('active');
      await authenticateSession(session, 'alice');

      // Move to trigger last seen update
      await dispatcher.dispatch(session, 'move east'); // To River Walk North

      const player = await playerModel.findByUserId(session.userId!);
      expect(player?.room_id).toBe(2); // Should be at River Walk North

      // Last seen should be recent (within last minute)
      const lastSeen = new Date(player!.last_seen);
      const now = new Date();
      const diffInMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
      expect(diffInMinutes).toBeLessThan(1);
    });

    it('should filter out stale players from online lists based on last seen', async () => {
      // This test checks that players with old last_seen timestamps don't appear online
      // The getOnlinePlayers method filters by last_seen > 5 minutes ago

      const session = createMockSession('stale');
      await authenticateSession(session, 'alice');

      // Manually set last_seen to old timestamp
      const db = MudDatabase.getInstance().getDb();
      db.prepare('UPDATE players SET last_seen = datetime(CURRENT_TIMESTAMP, \'-10 minutes\') WHERE user_id = ?')
        .run(session.userId);

      const activeSession = createMockSession('active');
      await authenticateSession(activeSession, 'bob');

      await dispatcher.dispatch(activeSession, 'who');
      const output = (activeSession.socket as MockSocket).getAllMessages();

      // Should only show bob (active), not alice (stale)
      expect(output).toContain('bob - The Alamo Plaza');
      expect(output).not.toContain('alice');
      expect(output).toContain('Total: 1 player(s) online');
    });
  });
});