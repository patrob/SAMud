import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandDispatcher } from '../commands/commandDispatcher';
import { Session, SessionState } from '../server/session';
import { SessionManager } from '../server/sessionManager';
import { MudDatabase } from '../database/db';
import { User } from '../models/user';
import { Player } from '../models/player';
import { registerAuthCommands } from '../commands/authCommands';
import { Socket } from 'net';
import fs from 'fs';

/**
 * Behavioral Authentication Flow Tests
 *
 * These tests focus on complete user experience flows, not internal implementation.
 * They test what users actually experience when interacting with the MUD's
 * authentication system through telnet commands.
 */

// Enhanced mock session factory for behavioral testing
function createMockSession(sessionId?: string): Session {
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

  // Override ID for predictable testing
  if (sessionId) {
    session.id = sessionId;
  }

  return session;
}

// Mock EventEmitter behavior for session line events
function mockSessionLineEvent(session: Session, line: string) {
  session.emit('line', line);
}

describe('Authentication Flow Behaviors', () => {
  let dispatcher: CommandDispatcher;
  let sessionManager: SessionManager;
  let testDbPath: string;
  let userModel: User;
  let playerModel: Player;

  beforeEach(async () => {
    testDbPath = './test-auth-flow.db';

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

    // Register auth commands (the actual implementation)
    registerAuthCommands(dispatcher, sessionManager);
  });

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Complete Signup Flow Behavior', () => {
    it('should guide user through full signup process and place them in room 1', async () => {
      const session = createMockSession('test-session-1');
      sessionManager.add(session);

      // User types 'signup' command
      await dispatcher.dispatch(session, 'signup');

      // Should prompt for username
      expect(session.writeLine).toHaveBeenCalledWith('Choose a username:');
      expect(session.state).toBe(SessionState.AUTHENTICATING);

      // User enters valid username
      await dispatcher.dispatch(session, '__auth_flow__ testuser');

      // Should prompt for password
      expect(session.writeLine).toHaveBeenCalledWith('Choose a password:');

      // User enters valid password
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      // Should prompt for password confirmation
      expect(session.writeLine).toHaveBeenCalledWith('Confirm password:');

      // User confirms password
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      // Should complete signup and place user in room 1
      expect(session.writeLine).toHaveBeenCalledWith('\r\nAccount created. Welcome, testuser!');
      expect(session.writeLine).toHaveBeenCalledWith('\r\nYou appear at The Alamo Plaza');
      expect(session.state).toBe(SessionState.AUTHENTICATED);
      expect(session.username).toBe('testuser');
      expect(session.roomId).toBe(1);
      expect(session.userId).toBeGreaterThan(0);

      // Should announce to other players in room
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'testuser has joined the game.',
        session.id
      );
    });

    it('should create user and player records in database during signup', async () => {
      const session = createMockSession('test-session-2');
      sessionManager.add(session);

      // Complete signup flow
      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ dbuser');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      // Verify user was created in database
      const user = await userModel.findByUsername('dbuser');
      expect(user).toBeTruthy();
      expect(user?.username).toBe('dbuser');

      // Verify player was created and placed in room 1
      const player = await playerModel.findByUserId(user!.id);
      expect(player).toBeTruthy();
      expect(player?.room_id).toBe(1);
      expect(player?.user_id).toBe(user!.id);
    });
  });

  describe('Signup Validation Behaviors', () => {
    it('should reject username that is too short and re-prompt', async () => {
      const session = createMockSession('test-session-3');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ ab');

      expect(session.writeLine).toHaveBeenCalledWith('Username must be between 3 and 20 characters.');
      expect(session.writeLine).toHaveBeenCalledWith('Choose a username:');
      expect(session.state).toBe(SessionState.AUTHENTICATING);
    });

    it('should reject username that is too long and re-prompt', async () => {
      const session = createMockSession('test-session-4');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ verylongusernamethatistoolong');

      expect(session.writeLine).toHaveBeenCalledWith('Username must be between 3 and 20 characters.');
      expect(session.writeLine).toHaveBeenCalledWith('Choose a username:');
      expect(session.state).toBe(SessionState.AUTHENTICATING);
    });

    it('should reject username with invalid characters and re-prompt', async () => {
      const session = createMockSession('test-session-5');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ user@name');

      expect(session.writeLine).toHaveBeenCalledWith('Username can only contain letters, numbers, and underscores.');
      expect(session.writeLine).toHaveBeenCalledWith('Choose a username:');
      expect(session.state).toBe(SessionState.AUTHENTICATING);
    });

    it('should reject password that is too short and re-prompt', async () => {
      const session = createMockSession('test-session-6');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ validuser');
      await dispatcher.dispatch(session, '__auth_flow__ short');

      expect(session.writeLine).toHaveBeenCalledWith('Password must be at least 6 characters.');
      expect(session.writeLine).toHaveBeenCalledWith('Choose a password:');
      expect(session.state).toBe(SessionState.AUTHENTICATING);
    });

    it('should handle password mismatch and restart password entry', async () => {
      const session = createMockSession('test-session-7');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ validuser');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');
      await dispatcher.dispatch(session, '__auth_flow__ DifferentPass456');

      expect(session.writeLine).toHaveBeenCalledWith('Passwords do not match. Please try again.');
      expect(session.writeLine).toHaveBeenCalledWith('Choose a password:');
      expect(session.state).toBe(SessionState.AUTHENTICATING);
    });

    it('should handle duplicate username error gracefully', async () => {
      // Create existing user
      await userModel.create('existinguser', 'Password123');

      const session = createMockSession('test-session-8');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ existinguser');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      expect(session.writeLine).toHaveBeenCalledWith('Error: Username already exists');
      expect(session.state).toBe(SessionState.CONNECTED);
    });
  });

  describe('Complete Login Flow Behavior', () => {
    it('should guide user through login process and restore their room location', async () => {
      // Create test user and player
      const userId = await userModel.create('loginuser', 'Password123');
      await playerModel.create(userId, 3); // Place in room 3

      const session = createMockSession('test-session-9');
      sessionManager.add(session);

      // User types 'login' command
      await dispatcher.dispatch(session, 'login');

      // Should prompt for username
      expect(session.writeLine).toHaveBeenCalledWith('Username:');
      expect(session.state).toBe(SessionState.AUTHENTICATING);

      // User enters username
      await dispatcher.dispatch(session, '__auth_flow__ loginuser');

      // Should prompt for password
      expect(session.writeLine).toHaveBeenCalledWith('Password:');

      // User enters password
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      // Should complete login and restore room location
      expect(session.writeLine).toHaveBeenCalledWith('\r\nWelcome back, loginuser!');
      expect(session.writeLine).toHaveBeenCalledWith('Type `look` to see your surroundings.');
      expect(session.state).toBe(SessionState.AUTHENTICATED);
      expect(session.username).toBe('loginuser');
      expect(session.roomId).toBe(3); // Should restore saved room
      expect(session.userId).toBe(userId);
    });

    it('should update last seen timestamp during login', async () => {
      const userId = await userModel.create('timestampuser', 'Password123');
      await playerModel.create(userId);

      const session = createMockSession('test-session-10');
      sessionManager.add(session);

      // Complete login flow
      await dispatcher.dispatch(session, 'login');
      await dispatcher.dispatch(session, '__auth_flow__ timestampuser');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      // Verify last_seen was updated
      const player = await playerModel.findByUserId(userId);
      expect(player?.last_seen).toBeTruthy();
      // Last seen should be very recent (within last minute)
      const lastSeenTime = new Date(player!.last_seen).getTime();
      const now = Date.now();
      expect(now - lastSeenTime).toBeLessThan(60000); // Less than 1 minute ago
    });

    it('should announce login to other players in the room', async () => {
      const userId = await userModel.create('announceuser', 'Password123');
      await playerModel.create(userId, 2); // Place in room 2

      const session = createMockSession('test-session-11');
      sessionManager.add(session);

      // Complete login flow
      await dispatcher.dispatch(session, 'login');
      await dispatcher.dispatch(session, '__auth_flow__ announceuser');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      // Should announce to other players in room 2
      expect(sessionManager.broadcastToRoom).toHaveBeenCalledWith(
        2,
        'announceuser has joined the game.',
        session.id
      );
    });
  });

  describe('Authentication State Management Behavior', () => {
    it('should prevent already authenticated users from signing up again', async () => {
      const session = createMockSession('test-session-12');
      session.state = SessionState.AUTHENTICATED;
      session.userId = 1;
      session.username = 'alreadyloggedin';
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');

      expect(session.writeLine).toHaveBeenCalledWith('You are already logged in.');
      expect(session.state).toBe(SessionState.AUTHENTICATED); // Should remain authenticated
    });

    it('should prevent already authenticated users from logging in again', async () => {
      const session = createMockSession('test-session-13');
      session.state = SessionState.AUTHENTICATED;
      session.userId = 1;
      session.username = 'alreadyloggedin';
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'login');

      expect(session.writeLine).toHaveBeenCalledWith('You are already logged in.');
      expect(session.state).toBe(SessionState.AUTHENTICATED); // Should remain authenticated
    });

    it('should track multiple concurrent authentication sessions independently', async () => {
      const session1 = createMockSession('test-session-14a');
      const session2 = createMockSession('test-session-14b');
      sessionManager.add(session1);
      sessionManager.add(session2);

      // Start signup on both sessions
      await dispatcher.dispatch(session1, 'signup');
      await dispatcher.dispatch(session2, 'signup');

      // Both should be in authenticating state
      expect(session1.state).toBe(SessionState.AUTHENTICATING);
      expect(session2.state).toBe(SessionState.AUTHENTICATING);

      // Enter different usernames
      await dispatcher.dispatch(session1, '__auth_flow__ user1');
      await dispatcher.dispatch(session2, '__auth_flow__ user2');

      // Both should progress to password prompt independently
      expect(session1.writeLine).toHaveBeenCalledWith('Choose a password:');
      expect(session2.writeLine).toHaveBeenCalledWith('Choose a password:');
    });
  });

  describe('Login Failure Scenarios', () => {
    it('should handle invalid username gracefully', async () => {
      const session = createMockSession('test-session-15');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'login');
      await dispatcher.dispatch(session, '__auth_flow__ nonexistentuser');
      await dispatcher.dispatch(session, '__auth_flow__ anypassword');

      expect(session.writeLine).toHaveBeenCalledWith('Invalid username or password.');
      expect(session.state).toBe(SessionState.CONNECTED); // Should return to connected state
    });

    it('should handle wrong password gracefully', async () => {
      await userModel.create('wrongpassuser', 'correctpassword');

      const session = createMockSession('test-session-16');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'login');
      await dispatcher.dispatch(session, '__auth_flow__ wrongpassuser');
      await dispatcher.dispatch(session, '__auth_flow__ wrongpassword');

      expect(session.writeLine).toHaveBeenCalledWith('Invalid username or password.');
      expect(session.state).toBe(SessionState.CONNECTED); // Should return to connected state
    });

    it('should not reveal whether username or password was wrong', async () => {
      // Create one valid user
      await userModel.create('validuser', 'validpass');

      const session1 = createMockSession('test-session-17a');
      const session2 = createMockSession('test-session-17b');
      sessionManager.add(session1);
      sessionManager.add(session2);

      // Test wrong username
      await dispatcher.dispatch(session1, 'login');
      await dispatcher.dispatch(session1, '__auth_flow__ invaliduser');
      await dispatcher.dispatch(session1, '__auth_flow__ anypass');

      // Test wrong password
      await dispatcher.dispatch(session2, 'login');
      await dispatcher.dispatch(session2, '__auth_flow__ validuser');
      await dispatcher.dispatch(session2, '__auth_flow__ wrongpass');

      // Both should get the same error message
      expect(session1.writeLine).toHaveBeenCalledWith('Invalid username or password.');
      expect(session2.writeLine).toHaveBeenCalledWith('Invalid username or password.');
    });

    it('should handle user with no player record by creating one', async () => {
      // Create user without player record (edge case)
      const userId = await userModel.create('noplayeruser', 'Password123');

      const session = createMockSession('test-session-18');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'login');
      await dispatcher.dispatch(session, '__auth_flow__ noplayeruser');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      // Should successfully login and create player record
      expect(session.state).toBe(SessionState.AUTHENTICATED);
      expect(session.roomId).toBe(1); // Should default to room 1

      // Verify player record was created
      const player = await playerModel.findByUserId(userId);
      expect(player).toBeTruthy();
      expect(player?.room_id).toBe(1);
    });
  });

  describe('Session Cleanup Behaviors', () => {
    it('should clean up authentication flow state on successful completion', async () => {
      const session = createMockSession('test-session-19');
      sessionManager.add(session);

      // Complete signup flow
      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ cleanupuser');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      // Attempting to send auth flow commands after completion should not work
      // (This tests that the flow state was properly cleaned up)
      const writeLineCallCount = (session.writeLine as any).mock.calls.length;
      await dispatcher.dispatch(session, '__auth_flow__ extracommand');

      // Should not have processed the extra auth flow command
      expect((session.writeLine as any).mock.calls.length).toBe(writeLineCallCount);
    });

    it('should clean up authentication flow state on error', async () => {
      // Create existing user to trigger error
      await userModel.create('erroruser', 'Password123');

      const session = createMockSession('test-session-20');
      sessionManager.add(session);

      // Try to signup with duplicate username
      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ erroruser');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      // Should be back in connected state after error
      expect(session.state).toBe(SessionState.CONNECTED);

      // Auth flow state should be cleaned up
      const writeLineCallCount = (session.writeLine as any).mock.calls.length;
      await dispatcher.dispatch(session, '__auth_flow__ extracommand');
      expect((session.writeLine as any).mock.calls.length).toBe(writeLineCallCount);
    });
  });

  describe('Advanced Authentication Behaviors (Missing Features)', () => {
    it('should implement session timeout during authentication flow', async () => {
      vi.useFakeTimers();
      const session = createMockSession('test-session-timeout');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');

      // This should implement timeout functionality but currently doesn't
      // After 5 minutes of inactivity during auth, should timeout
      const timeoutHandler = vi.fn();
      session.on('authTimeout', timeoutHandler);

      // Simulate 5 minute timeout
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(timeoutHandler).toHaveBeenCalled();
      expect(session.state).toBe(SessionState.CONNECTED);
      vi.useRealTimers();
    });

    it('should implement rate limiting for failed login attempts', async () => {
      await userModel.create('ratelimituser', 'Password123');

      const session = createMockSession('test-session-ratelimit');
      sessionManager.add(session);

      // Make 3 failed login attempts
      for (let i = 0; i < 3; i++) {
        await dispatcher.dispatch(session, 'login');
        await dispatcher.dispatch(session, '__auth_flow__ ratelimituser');
        await dispatcher.dispatch(session, '__auth_flow__ wrongpassword');
      }

      // Fourth attempt should be rate limited
      await dispatcher.dispatch(session, 'login');

      expect(session.writeLine).toHaveBeenCalledWith(
        'Too many failed login attempts. Please wait 5 minutes before trying again.'
      );
    });

    it('should implement password strength validation beyond just length', async () => {
      const session = createMockSession('test-session-strength');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ strengthuser');

      // Test weak password (all lowercase, no numbers)
      await dispatcher.dispatch(session, '__auth_flow__ weakpassword');

      expect(session.writeLine).toHaveBeenCalledWith(
        'Password must contain at least one uppercase letter, one lowercase letter, and one number.'
      );
      expect(session.writeLine).toHaveBeenCalledWith('Choose a password:');
    });

    it('should implement graceful handling of database connection failures', async () => {
      const session = createMockSession('test-session-dbfail');
      sessionManager.add(session);

      // Mock database failure
      const originalCreate = userModel.create;
      userModel.create = vi.fn().mockRejectedValue(new Error('Database connection failed'));

      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ dbfailuser');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');
      await dispatcher.dispatch(session, '__auth_flow__ Password123');

      expect(session.writeLine).toHaveBeenCalledWith(
        'Service temporarily unavailable. Please try again later.'
      );
      expect(session.state).toBe(SessionState.CONNECTED);

      // Restore original method
      userModel.create = originalCreate;
    });

    it('should implement concurrent login prevention for same user', async () => {
      const userId = await userModel.create('concurrentuser', 'Password123');
      await playerModel.create(userId);

      // First session logs in successfully
      const session1 = createMockSession('test-session-concurrent1');
      sessionManager.add(session1);

      await dispatcher.dispatch(session1, 'login');
      await dispatcher.dispatch(session1, '__auth_flow__ concurrentuser');
      await dispatcher.dispatch(session1, '__auth_flow__ Password123');

      expect(session1.state).toBe(SessionState.AUTHENTICATED);

      // Second session tries to login with same user
      const session2 = createMockSession('test-session-concurrent2');
      sessionManager.add(session2);

      await dispatcher.dispatch(session2, 'login');
      await dispatcher.dispatch(session2, '__auth_flow__ concurrentuser');
      await dispatcher.dispatch(session2, '__auth_flow__ Password123');

      expect(session2.writeLine).toHaveBeenCalledWith(
        'This user is already logged in. Please disconnect the other session first.'
      );
      expect(session2.state).toBe(SessionState.CONNECTED);
    });

    it('should implement comprehensive input sanitization', async () => {
      const session = createMockSession('test-session-sanitize');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');

      // Test SQL injection attempt in username
      await dispatcher.dispatch(session, "__auth_flow__ admin'; DROP TABLE users; --");

      expect(session.writeLine).toHaveBeenCalledWith(
        'Username can only contain letters, numbers, and underscores.'
      );

      // Test XSS attempt in username
      await dispatcher.dispatch(session, '__auth_flow__ <script>alert("xss")</script>');

      expect(session.writeLine).toHaveBeenCalledWith(
        'Username can only contain letters, numbers, and underscores.'
      );
    });

    it('should implement proper session state recovery after server restart', async () => {
      // This test would verify that authentication state can be recovered
      // if the server restarts during an authentication flow
      const session = createMockSession('test-session-recovery');
      sessionManager.add(session);

      await dispatcher.dispatch(session, 'signup');
      await dispatcher.dispatch(session, '__auth_flow__ recoveryuser');

      // Simulate server restart by creating new dispatcher and session manager
      const newDispatcher = new CommandDispatcher();
      const newSessionManager = new SessionManager();
      newSessionManager.broadcastToRoom = vi.fn();

      registerAuthCommands(newDispatcher, newSessionManager);

      // Session should be able to continue or be properly reset
      await newDispatcher.dispatch(session, '__auth_flow__ Password123');

      expect(session.writeLine).toHaveBeenCalledWith(
        'Authentication session expired. Please start over.'
      );
      expect(session.state).toBe(SessionState.CONNECTED);
    });
  });
});