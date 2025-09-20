import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandDispatcher } from '../commands/commandDispatcher';
import { Session, SessionState } from '../server/session';
import { SessionManager } from '../server/sessionManager';
import { MudDatabase } from '../database/db';
import { User } from '../models/user';
import { Player } from '../models/player';
import { registerChatCommands } from '../commands/chatCommands';
import { chatLogger } from '../utils/logger';
import { Socket } from 'net';
import fs from 'fs';

/**
 * Behavioral Communication Tests
 *
 * These tests focus on complete chat communication flows and user experience,
 * not internal implementation details. They test what users actually experience
 * when using chat commands in the SAMud game through realistic scenarios.
 */

// Enhanced mock session factory for communication testing
function createMockSession(sessionId: string, username?: string, userId?: number, roomId?: number): Session {
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

  // Set session properties for testing
  session.id = sessionId;
  if (username) {
    session.username = username;
    session.state = SessionState.AUTHENTICATED;
  }
  if (userId) {
    session.userId = userId;
  }
  if (roomId) {
    session.roomId = roomId;
  }

  return session;
}

describe('Communication Behaviors', () => {
  let dispatcher: CommandDispatcher;
  let sessionManager: SessionManager;
  let testDbPath: string;
  let userModel: User;
  let playerModel: Player;

  // Mock chatLogger to track logging calls
  let chatLoggerSpy: any;

  beforeEach(async () => {
    testDbPath = './test-communication.db';

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize test database and models
    MudDatabase.getInstance(testDbPath);
    userModel = new User();
    playerModel = new Player();

    // Set up dispatcher and session manager
    dispatcher = new CommandDispatcher();
    sessionManager = new SessionManager();

    // Mock the broadcast methods for testing
    sessionManager.broadcastToRoom = vi.fn();
    sessionManager.broadcast = vi.fn();
    sessionManager.broadcastToAuthenticated = vi.fn();

    // Mock chatLogger to track logging behavior
    chatLoggerSpy = vi.spyOn(chatLogger, 'info');

    // Register chat commands (the actual implementation)
    registerChatCommands(dispatcher, sessionManager);
  });

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Restore logger
    vi.restoreAllMocks();
  });

  describe('Say Command Behavior (Room-Scoped Chat)', () => {
    it('should deliver say message to sender with confirmation and other players in same room', async () => {
      // Set up authenticated user in room 1
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      const bob = createMockSession('bob-session', 'bob', 2, 1);  // Same room
      const carol = createMockSession('carol-session', 'carol', 3, 2);  // Different room

      sessionManager.add(alice);
      sessionManager.add(bob);
      sessionManager.add(carol);

      // Alice says something in room 1
      await dispatcher.dispatch(alice, 'say Hello everyone in the Alamo!');

      // Alice should see confirmation message
      expect(alice.writeLine).toHaveBeenCalledWith('[Room] You say: Hello everyone in the Alamo!');

      // Bob (same room) should receive the message
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '[Room] alice says: Hello everyone in the Alamo!',
        'alice-session'
      );

      // Carol (different room) should NOT receive the message (verified by broadcastToRoom only targeting room 1)
      expect(sessionManager.broadcastToAuthenticated).not.toHaveBeenCalled();
    });

    it('should reject say command from unauthenticated users', async () => {
      const unauthenticatedSession = createMockSession('unauth-session');
      unauthenticatedSession.state = SessionState.CONNECTED; // Not authenticated
      sessionManager.add(unauthenticatedSession);

      await dispatcher.dispatch(unauthenticatedSession, 'say Hello?');

      expect(unauthenticatedSession.writeLine).toHaveBeenCalledWith('You must be logged in to speak.');
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalled();
    });

    it('should reject say command when user has no room location', async () => {
      const noRoomSession = createMockSession('noroom-session', 'homeless', 1);
      noRoomSession.roomId = undefined; // No room assigned
      sessionManager.add(noRoomSession);

      await dispatcher.dispatch(noRoomSession, 'say Where am I?');

      expect(noRoomSession.writeLine).toHaveBeenCalledWith('You are not in any room.');
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalled();
    });

    it('should handle empty say message with helpful prompt', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'say');
      await dispatcher.dispatch(alice, 'say   '); // Just whitespace

      expect(alice.writeLine).toHaveBeenCalledWith('Say what?');
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalled();
    });

    it('should log room chat activity with correct parameters', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'say Test message for logging');

      expect(chatLoggerSpy).toHaveBeenCalledWith(
        {
          sessionId: 'alice-session',
          username: 'alice',
          userId: 1,
          roomId: 1,
          messageLength: 'Test message for logging'.length,
          type: 'room_chat'
        },
        'Room chat: alice in room 1'
      );
    });
  });

  describe('Shout Command Behavior (Global Chat)', () => {
    it('should broadcast shout message to all authenticated players globally', async () => {
      // Set up authenticated users in different rooms
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      const bob = createMockSession('bob-session', 'bob', 2, 2);
      const carol = createMockSession('carol-session', 'carol', 3, 3);

      sessionManager.add(alice);
      sessionManager.add(bob);
      sessionManager.add(carol);

      // Alice shouts globally
      await dispatcher.dispatch(alice, 'shout Welcome to SAMud, everyone!');

      // Alice should see confirmation message
      expect(alice.writeLine).toHaveBeenCalledWith('[Global] You shout: Welcome to SAMud, everyone!');

      // All authenticated players should receive the shout
      expect(sessionManager.broadcastToAuthenticated).toHaveBeenCalledWith(
        '[Global] alice shouts: Welcome to SAMud, everyone!',
        'alice-session'
      );

      // Should NOT use room-based broadcasting for shouts
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalled();
    });

    it('should reject shout command from unauthenticated users', async () => {
      const unauthenticatedSession = createMockSession('unauth-session');
      unauthenticatedSession.state = SessionState.CONNECTED;
      sessionManager.add(unauthenticatedSession);

      await dispatcher.dispatch(unauthenticatedSession, 'shout Hello world!');

      expect(unauthenticatedSession.writeLine).toHaveBeenCalledWith('You must be logged in to shout.');
      expect(sessionManager.broadcastToAuthenticated).not.toHaveBeenCalled();
    });

    it('should handle empty shout message with helpful prompt', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'shout');
      await dispatcher.dispatch(alice, 'shout   '); // Just whitespace

      expect(alice.writeLine).toHaveBeenCalledWith('Shout what?');
      expect(sessionManager.broadcastToAuthenticated).not.toHaveBeenCalled();
    });

    it('should log global shout activity with correct parameters', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'shout Global announcement');

      expect(chatLoggerSpy).toHaveBeenCalledWith(
        {
          sessionId: 'alice-session',
          username: 'alice',
          userId: 1,
          roomId: 1,
          messageLength: 'Global announcement'.length,
          type: 'global_shout'
        },
        'Global shout: alice'
      );
    });

    it('should work even when user has no room assignment (edge case)', async () => {
      const noRoomSession = createMockSession('noroom-session', 'wanderer', 1);
      noRoomSession.roomId = undefined; // No room assigned but authenticated
      sessionManager.add(noRoomSession);

      await dispatcher.dispatch(noRoomSession, 'shout I am lost but can still shout!');

      expect(noRoomSession.writeLine).toHaveBeenCalledWith('[Global] You shout: I am lost but can still shout!');
      expect(sessionManager.broadcastToAuthenticated).toHaveBeenCalledWith(
        '[Global] wanderer shouts: I am lost but can still shout!',
        'noroom-session'
      );
    });
  });

  describe('Emote Command Behavior (Third-Person Actions)', () => {
    it('should deliver emote to sender and other players in same room with proper formatting', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      const bob = createMockSession('bob-session', 'bob', 2, 1);  // Same room

      sessionManager.add(alice);
      sessionManager.add(bob);

      await dispatcher.dispatch(alice, 'emote dances around the Alamo Plaza');

      // Alice should see self-referential message
      expect(alice.writeLine).toHaveBeenCalledWith('* You dances around the Alamo Plaza');

      // Other players in room should see third-person message
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '* alice dances around the Alamo Plaza',
        'alice-session'
      );
    });

    it('should work with me alias command', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'me waves to everyone');

      expect(alice.writeLine).toHaveBeenCalledWith('* You waves to everyone');
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '* alice waves to everyone',
        'alice-session'
      );
    });

    it('should reject emote command from unauthenticated users', async () => {
      const unauthenticatedSession = createMockSession('unauth-session');
      unauthenticatedSession.state = SessionState.CONNECTED;
      sessionManager.add(unauthenticatedSession);

      await dispatcher.dispatch(unauthenticatedSession, 'emote tries to dance');

      expect(unauthenticatedSession.writeLine).toHaveBeenCalledWith('You must be logged in to emote.');
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalled();
    });

    it('should reject emote command when user has no room location', async () => {
      const noRoomSession = createMockSession('noroom-session', 'homeless', 1);
      noRoomSession.roomId = undefined;
      sessionManager.add(noRoomSession);

      await dispatcher.dispatch(noRoomSession, 'emote looks around confused');

      expect(noRoomSession.writeLine).toHaveBeenCalledWith('You are not in any room.');
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalled();
    });

    it('should handle empty emote action with helpful prompt', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'emote');
      await dispatcher.dispatch(alice, 'me   '); // Just whitespace

      expect(alice.writeLine).toHaveBeenCalledWith('Emote what?');
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalled();
    });

    it('should log emote activity with correct parameters', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'emote practices sword fighting');

      expect(chatLoggerSpy).toHaveBeenCalledWith(
        {
          sessionId: 'alice-session',
          username: 'alice',
          userId: 1,
          roomId: 1,
          actionLength: 'practices sword fighting'.length,
          type: 'emote'
        },
        'Emote: alice in room 1'
      );
    });
  });

  describe('Multi-User Chat Scenarios', () => {
    it('should handle multiple players chatting simultaneously in different rooms', async () => {
      // Players in room 1
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      const bob = createMockSession('bob-session', 'bob', 2, 1);

      // Players in room 2
      const carol = createMockSession('carol-session', 'carol', 3, 2);
      const dave = createMockSession('dave-session', 'dave', 4, 2);

      sessionManager.add(alice);
      sessionManager.add(bob);
      sessionManager.add(carol);
      sessionManager.add(dave);

      // Room 1 conversation
      await dispatcher.dispatch(alice, 'say Hey Bob, nice to see you!');
      await dispatcher.dispatch(bob, 'say Hi Alice! How are you doing?');

      // Room 2 conversation
      await dispatcher.dispatch(carol, 'say Dave, want to explore together?');
      await dispatcher.dispatch(dave, 'say Sure Carol, let\'s go!');

      // Verify room 1 messages stayed in room 1
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '[Room] alice says: Hey Bob, nice to see you!',
        'alice-session'
      );
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '[Room] bob says: Hi Alice! How are you doing?',
        'bob-session'
      );

      // Verify room 2 messages stayed in room 2
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        2,
        '[Room] carol says: Dave, want to explore together?',
        'carol-session'
      );
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        2,
        '[Room] dave says: Sure Carol, let\'s go!',
        'dave-session'
      );
    });

    it('should handle global shouts reaching all players regardless of room', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      const bob = createMockSession('bob-session', 'bob', 2, 2);
      const carol = createMockSession('carol-session', 'carol', 3, 3);

      sessionManager.add(alice);
      sessionManager.add(bob);
      sessionManager.add(carol);

      // Alice shouts from room 1
      await dispatcher.dispatch(alice, 'shout Server restart in 5 minutes!');

      // Bob shouts from room 2
      await dispatcher.dispatch(bob, 'shout Thanks for the warning!');

      // Both shouts should use global broadcast
      expect(sessionManager.broadcastToAuthenticated).toHaveBeenCalledWith(
        '[Global] alice shouts: Server restart in 5 minutes!',
        'alice-session'
      );
      expect(sessionManager.broadcastToAuthenticated).toHaveBeenCalledWith(
        '[Global] bob shouts: Thanks for the warning!',
        'bob-session'
      );

      // No room-specific broadcasts for shouts
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalled();
    });

    it('should maintain proper sender identification across different chat types', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      // Use all three chat types in sequence
      await dispatcher.dispatch(alice, 'say Hello room!');
      await dispatcher.dispatch(alice, 'shout Hello world!');
      await dispatcher.dispatch(alice, 'emote waves enthusiastically');

      // Verify proper sender identification in each message format
      expect(alice.writeLine).toHaveBeenCalledWith('[Room] You say: Hello room!');
      expect(alice.writeLine).toHaveBeenCalledWith('[Global] You shout: Hello world!');
      expect(alice.writeLine).toHaveBeenCalledWith('* You waves enthusiastically');

      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '[Room] alice says: Hello room!',
        'alice-session'
      );
      expect(sessionManager.broadcastToAuthenticated).toHaveBeenCalledWith(
        '[Global] alice shouts: Hello world!',
        'alice-session'
      );
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '* alice waves enthusiastically',
        'alice-session'
      );
    });
  });

  describe('Message Content Validation', () => {
    it('should preserve message content exactly including special characters', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      const specialMessage = 'Hey! @everyone #meeting $100 50% off... what\'s up?!';

      await dispatcher.dispatch(alice, `say ${specialMessage}`);

      expect(alice.writeLine).toHaveBeenCalledWith(`[Room] You say: ${specialMessage}`);
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        `[Room] alice says: ${specialMessage}`,
        'alice-session'
      );
    });

    it('should handle very long messages appropriately', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      const longMessage = 'A'.repeat(500); // Very long message

      await dispatcher.dispatch(alice, `say ${longMessage}`);

      expect(alice.writeLine).toHaveBeenCalledWith(`[Room] You say: ${longMessage}`);
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        `[Room] alice says: ${longMessage}`,
        'alice-session'
      );

      // Verify logging captures correct message length
      expect(chatLoggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          messageLength: 500,
          type: 'room_chat'
        }),
        expect.any(String)
      );
    });

    it('should handle multi-word commands with proper argument parsing', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'say    multiple   spaces   between   words   ');

      // Should normalize the message content (spaces collapsed)
      expect(alice.writeLine).toHaveBeenCalledWith('[Room] You say: multiple spaces between words');
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '[Room] alice says: multiple spaces between words',
        'alice-session'
      );
    });
  });

  describe('Cross-Room Communication Boundaries', () => {
    it('should strictly enforce room boundaries for say and emote commands', async () => {
      const room1Player = createMockSession('room1-session', 'player1', 1, 1);
      const room2Player = createMockSession('room2-session', 'player2', 2, 2);
      const room3Player = createMockSession('room3-session', 'player3', 3, 3);

      sessionManager.add(room1Player);
      sessionManager.add(room2Player);
      sessionManager.add(room3Player);

      // Player in room 1 says something
      await dispatcher.dispatch(room1Player, 'say Private conversation in room 1');

      // Player in room 2 emotes
      await dispatcher.dispatch(room2Player, 'emote practices combat moves');

      // Verify messages only target their respective rooms
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '[Room] player1 says: Private conversation in room 1',
        'room1-session'
      );
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        2,
        '* player2 practices combat moves',
        'room2-session'
      );

      // Global broadcast should never be called for room-scoped commands
      expect(sessionManager.broadcastToAuthenticated).not.toHaveBeenCalled();
    });

    it('should allow shout to transcend all room boundaries', async () => {
      const alamo = createMockSession('alamo-session', 'alamoguard', 1, 1);
      const riverwalk = createMockSession('riverwalk-session', 'walker', 2, 2);
      const pearl = createMockSession('pearl-session', 'shopper', 3, 3);

      sessionManager.add(alamo);
      sessionManager.add(riverwalk);
      sessionManager.add(pearl);

      // Guard at Alamo shouts an important announcement
      await dispatcher.dispatch(alamo, 'shout ATTENTION: Special event starting at the Pearl!');

      // Should use global broadcast, not room broadcast
      expect(sessionManager.broadcastToAuthenticated).toHaveBeenCalledWith(
        '[Global] alamoguard shouts: ATTENTION: Special event starting at the Pearl!',
        'alamo-session'
      );
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalled();
    });
  });

  describe('Authentication Edge Cases', () => {
    it('should block all chat commands consistently for unauthenticated users', async () => {
      const unauthUser = createMockSession('unauth-session');
      unauthUser.state = SessionState.CONNECTED; // Not authenticated
      sessionManager.add(unauthUser);

      // Try all chat commands
      await dispatcher.dispatch(unauthUser, 'say Hello');
      await dispatcher.dispatch(unauthUser, 'shout Hello world');
      await dispatcher.dispatch(unauthUser, 'emote waves');
      await dispatcher.dispatch(unauthUser, 'me dances');

      // All should be rejected with appropriate messages
      expect(unauthUser.writeLine).toHaveBeenCalledWith('You must be logged in to speak.');
      expect(unauthUser.writeLine).toHaveBeenCalledWith('You must be logged in to shout.');
      expect(unauthUser.writeLine).toHaveBeenCalledWith('You must be logged in to emote.');

      // No broadcasts should occur
      expect(sessionManager.broadcastToRoom).not.toHaveBeenCalled();
      expect(sessionManager.broadcastToAuthenticated).not.toHaveBeenCalled();
    });

    it('should handle user with missing username gracefully', async () => {
      const brokenSession = createMockSession('broken-session');
      brokenSession.state = SessionState.AUTHENTICATED;
      brokenSession.userId = 1;
      brokenSession.username = undefined; // Missing username
      brokenSession.roomId = 1;
      sessionManager.add(brokenSession);

      await dispatcher.dispatch(brokenSession, 'say This should fail');
      await dispatcher.dispatch(brokenSession, 'shout This should also fail');

      // Should be rejected due to missing username
      expect(brokenSession.writeLine).toHaveBeenCalledWith('You are not in any room.');
      expect(brokenSession.writeLine).toHaveBeenCalledWith('You are not properly logged in.');
    });
  });

  describe('Command Alias Functionality', () => {
    it('should handle me alias for emote command exactly like emote', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      // Test both commands produce identical behavior
      await dispatcher.dispatch(alice, 'emote stretches lazily');
      const emoteCallCount = (sessionManager.broadcastToRoom as any).mock.calls.length;

      await dispatcher.dispatch(alice, 'me yawns loudly');
      const meCallCount = (sessionManager.broadcastToRoom as any).mock.calls.length;

      // Both should result in broadcasts
      expect(meCallCount).toBe(emoteCallCount + 1);

      // Verify identical message formatting
      expect(alice.writeLine).toHaveBeenCalledWith('* You stretches lazily');
      expect(alice.writeLine).toHaveBeenCalledWith('* You yawns loudly');

      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '* alice stretches lazily',
        'alice-session'
      );
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '* alice yawns loudly',
        'alice-session'
      );
    });

    it('should log me alias as emote type in logging system', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'me tests logging behavior');

      expect(chatLoggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'emote',
          actionLength: 'tests logging behavior'.length
        }),
        'Emote: alice in room 1'
      );
    });
  });

  describe('Chat Logging Integration', () => {
    it('should log all chat types with appropriate metadata', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      // Test all chat types
      await dispatcher.dispatch(alice, 'say Room message');
      await dispatcher.dispatch(alice, 'shout Global message');
      await dispatcher.dispatch(alice, 'emote performs action');

      // Verify each type logged correctly
      expect(chatLoggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'room_chat' }),
        expect.stringContaining('Room chat: alice in room 1')
      );
      expect(chatLoggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'global_shout' }),
        expect.stringContaining('Global shout: alice')
      );
      expect(chatLoggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'emote' }),
        expect.stringContaining('Emote: alice in room 1')
      );
    });

    it('should include all required session metadata in logs', async () => {
      const alice = createMockSession('alice-session', 'alice', 42, 7);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'say Testing metadata logging');

      expect(chatLoggerSpy).toHaveBeenCalledWith(
        {
          sessionId: 'alice-session',
          username: 'alice',
          userId: 42,
          roomId: 7,
          messageLength: 'Testing metadata logging'.length,
          type: 'room_chat'
        },
        'Room chat: alice in room 7'
      );
    });

    it('should log action length for emotes instead of message length', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'emote performs a complex dance routine');

      expect(chatLoggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionLength: 'performs a complex dance routine'.length,
          type: 'emote'
        }),
        expect.any(String)
      );

      // Should not have messageLength property for emotes
      const logCall = chatLoggerSpy.mock.calls.find(call =>
        call[0].type === 'emote'
      );
      expect(logCall[0]).not.toHaveProperty('messageLength');
    });
  });

  describe('Missing Communication Features (Failing Tests)', () => {
    it('should implement whisper command for private player-to-player messaging', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      const bob = createMockSession('bob-session', 'bob', 2, 1);

      sessionManager.add(alice);
      sessionManager.add(bob);

      // This should work but doesn't exist yet
      await dispatcher.dispatch(alice, 'whisper bob Hey, want to team up?');

      expect(alice.writeLine).toHaveBeenCalledWith('You whisper to bob: Hey, want to team up?');
      expect(bob.writeLine).toHaveBeenCalledWith('alice whispers to you: Hey, want to team up?');
    });

    it('should implement tell command for cross-room private messaging', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      const bob = createMockSession('bob-session', 'bob', 2, 2); // Different room

      sessionManager.add(alice);
      sessionManager.add(bob);

      await dispatcher.dispatch(alice, 'tell bob Meet me at the Riverwalk');

      expect(alice.writeLine).toHaveBeenCalledWith('You tell bob: Meet me at the Riverwalk');
      expect(bob.writeLine).toHaveBeenCalledWith('alice tells you: Meet me at the Riverwalk');
    });

    it('should implement chat channels for topic-based conversations', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      const bob = createMockSession('bob-session', 'bob', 2, 2);

      sessionManager.add(alice);
      sessionManager.add(bob);

      // Join a channel
      await dispatcher.dispatch(alice, 'channel join newbie');
      await dispatcher.dispatch(bob, 'channel join newbie');

      // Chat in channel
      await dispatcher.dispatch(alice, 'channel newbie How do I get to the Pearl?');

      expect(alice.writeLine).toHaveBeenCalledWith('[newbie] You say: How do I get to the Pearl?');
      expect(bob.writeLine).toHaveBeenCalledWith('[newbie] alice says: How do I get to the Pearl?');
    });

    it('should implement page command for admin announcements', async () => {
      const admin = createMockSession('admin-session', 'admin', 1, 1);
      const alice = createMockSession('alice-session', 'alice', 2, 2);

      sessionManager.add(admin);
      sessionManager.add(alice);

      await dispatcher.dispatch(admin, 'page Server maintenance in 10 minutes');

      expect(alice.writeLine).toHaveBeenCalledWith('*** admin pages: Server maintenance in 10 minutes ***');
    });

    it('should implement chat history/logs for players to review recent messages', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      // Some chat happens first
      await dispatcher.dispatch(alice, 'say Hello world');

      // Then alice wants to see recent chat
      await dispatcher.dispatch(alice, 'history');

      expect(alice.writeLine).toHaveBeenCalledWith('=== Recent Chat History ===');
      expect(alice.writeLine).toHaveBeenCalledWith('[Room] alice says: Hello world');
    });

    it('should implement ignore functionality to block messages from specific users', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      const annoying = createMockSession('annoying-session', 'annoying', 2, 1);

      sessionManager.add(alice);
      sessionManager.add(annoying);

      // Alice ignores the annoying player
      await dispatcher.dispatch(alice, 'ignore annoying');
      expect(alice.writeLine).toHaveBeenCalledWith('You are now ignoring annoying.');

      // Annoying player says something
      await dispatcher.dispatch(annoying, 'say Alice, can you hear me?');

      // Alice should not receive the message (would need custom sessionManager logic)
      // This test will fail because ignore functionality doesn't exist
    });

    it('should implement emote targeting for directed actions', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      const bob = createMockSession('bob-session', 'bob', 2, 1);

      sessionManager.add(alice);
      sessionManager.add(bob);

      await dispatcher.dispatch(alice, 'emote bob waves at you');

      expect(alice.writeLine).toHaveBeenCalledWith('* You wave at bob');
      expect(bob.writeLine).toHaveBeenCalledWith('* alice waves at you');
    });

    it('should implement OOC (Out of Character) chat for meta conversations', async () => {
      const alice = createMockSession('alice-session', 'alice', 1, 1);
      sessionManager.add(alice);

      await dispatcher.dispatch(alice, 'ooc Does anyone know the commands?');

      expect(alice.writeLine).toHaveBeenCalledWith('(OOC) You say: Does anyone know the commands?');
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        '(OOC) alice says: Does anyone know the commands?',
        'alice-session'
      );
    });
  });
});