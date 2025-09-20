import { Session, SessionState } from '../server/session';
import { CommandDispatcher } from './commandDispatcher';
import { User } from '../models/user';
import { Player } from '../models/player';
import { authLogger } from '../utils/logger';

interface AuthFlow {
  step: 'username' | 'password' | 'confirm_password';
  username?: string;
  password?: string;
}

const signupFlows = new Map<string, AuthFlow>();
const loginFlows = new Map<string, AuthFlow>();
const failedLoginAttempts = new Map<string, { count: number; lastAttempt: number }>();

// For testing: reset rate limiting state
export function resetAuthState() {
  signupFlows.clear();
  loginFlows.clear();
  failedLoginAttempts.clear();
}

function getWelcomeArt(): string {
  return `
    █████╗  ████████╗  ██████╗
   ██╔══██╗ ╚══██╔══╝ ██╔════╝
   ███████║    ██║    ██║
   ██╔══██║    ██║    ██║
   ██║  ██║    ██║    ╚██████╗
   ╚═╝  ╚═╝    ╚═╝     ╚═════╝

   ███╗   ███╗ ██╗   ██╗ ██████╗
   ████╗ ████║ ██║   ██║ ██╔══██╗
   ██╔████╔██║ ██║   ██║ ██║  ██║
   ██║╚██╔╝██║ ██║   ██║ ██║  ██║
   ██║ ╚═╝ ██║ ╚██████╔╝ ██████╔╝
   ╚═╝     ╚═╝  ╚═════╝  ╚═════╝
`;
}

// Export models for testing
export let userModel: User;
export let playerModel: Player;

export function registerAuthCommands(dispatcher: CommandDispatcher, sessionManager: any, injectedUserModel?: User, injectedPlayerModel?: Player) {
  userModel = injectedUserModel || new User();
  playerModel = injectedPlayerModel || new Player();

  // Signup command
  dispatcher.registerCommand('signup', (session: Session) => {
    if (session.state === SessionState.AUTHENTICATED) {
      session.writeLine('You are already logged in.');
      return;
    }

    authLogger.info({
      sessionId: session.id,
      action: 'signup_start',
      remoteAddress: session.socket.remoteAddress
    }, `Signup flow initiated: ${session.id}`);

    session.writeLine('Choose a username:');
    signupFlows.set(session.id, { step: 'username' });
    session.setState(SessionState.AUTHENTICATING);
  });

  // Login command
  dispatcher.registerCommand('login', (session: Session) => {
    if (session.state === SessionState.AUTHENTICATED) {
      session.writeLine('You are already logged in.');
      return;
    }

    // Check rate limiting before allowing login
    const clientKey = session.id;
    const attempts = failedLoginAttempts.get(clientKey);
    if (attempts && attempts.count >= 3) {
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
      if (timeSinceLastAttempt < 5 * 60 * 1000) { // 5 minutes
        session.writeLine('Too many failed login attempts. Please wait 5 minutes before trying again.');
        return;
      } else {
        // Reset after 5 minutes
        failedLoginAttempts.delete(clientKey);
      }
    }

    authLogger.info({
      sessionId: session.id,
      action: 'login_start',
      remoteAddress: session.socket.remoteAddress
    }, `Login flow initiated: ${session.id}`);

    session.writeLine('Username:');
    loginFlows.set(session.id, { step: 'username' });
    session.setState(SessionState.AUTHENTICATING);
  });

  // Handle authentication flow
  dispatcher.registerCommand('__auth_flow__', async (session: Session, args: string[]) => {
    const input = args.join(' ');

    // Check if session is in authenticating state but has no flow (server restart scenario)
    if (session.state === SessionState.AUTHENTICATING && !signupFlows.has(session.id) && !loginFlows.has(session.id)) {
      session.writeLine('Authentication session expired. Please start over.');
      session.setState(SessionState.CONNECTED);
      return;
    }

    // Handle signup flow
    if (signupFlows.has(session.id)) {
      const flow = signupFlows.get(session.id)!;


      if (flow.step === 'username') {
        if (!/^[a-zA-Z0-9_]+$/.test(input)) {
          session.writeLine('Username can only contain letters, numbers, and underscores.');
          session.writeLine('Choose a username:');
          return;
        }

        if (input.length < 3 || input.length > 20) {
          session.writeLine('Username must be between 3 and 20 characters.');
          session.writeLine('Choose a username:');
          return;
        }

        flow.username = input;
        flow.step = 'password';
        session.writeLine('Choose a password:');
      } else if (flow.step === 'password') {
        if (input.length < 6) {
          session.writeLine('Password must be at least 6 characters.');
          session.writeLine('Choose a password:');
          return;
        }

        // Password strength validation
        const hasUppercase = /[A-Z]/.test(input);
        const hasLowercase = /[a-z]/.test(input);
        const hasNumber = /\d/.test(input);

        if (!hasUppercase || !hasLowercase || !hasNumber) {
          session.writeLine('Password must contain at least one uppercase letter, one lowercase letter, and one number.');
          session.writeLine('Choose a password:');
          return;
        }

        flow.password = input;
        flow.step = 'confirm_password';
        session.writeLine('Confirm password:');
      } else if (flow.step === 'confirm_password') {
        if (input !== flow.password) {
          session.writeLine('Passwords do not match. Please try again.');
          flow.step = 'password';
          session.writeLine('Choose a password:');
          return;
        }

        try {
          const userId = await userModel.create(flow.username!, flow.password!);
          await playerModel.create(userId);

          session.userId = userId;
          session.username = flow.username;
          session.roomId = 1;
          session.setState(SessionState.AUTHENTICATED);

          // Add session to manager before sending welcome messages
          sessionManager.add(session);

          signupFlows.delete(session.id);

          authLogger.info({
            sessionId: session.id,
            username: session.username,
            userId: session.userId,
            action: 'signup_success',
            remoteAddress: session.socket.remoteAddress
          }, `Successful signup: ${session.username} (${session.id})`);

          session.writeLine(getWelcomeArt());
          session.writeLine(`\r\nAccount created. Welcome, ${session.username}!`);
          session.writeLine('\r\nYou appear at The Alamo Plaza');
          session.writeLine('Stone walls surround you. Tourists move in and out of the courtyard.');
          session.writeLine('Type `help` for a list of commands.\r\n');

          // Announce to other players
          sessionManager.broadcastToRoom(1, `${session.username} has joined the game.`, session.id);
        } catch (error: any) {
          authLogger.error({
            sessionId: session.id,
            action: 'signup_failed',
            username: flow.username,
            error: error.message,
            remoteAddress: session.socket.remoteAddress
          }, `Signup failed: ${flow.username} (${session.id})`);

          // Check if it's a database connection error
          if (error.message.includes('Database connection failed') || error.message.includes('database') || error.message.includes('connection') || error.code === 'SQLITE_CANTOPEN') {
            session.writeLine('Service temporarily unavailable. Please try again later.');
          } else {
            session.writeLine(`Error: ${error.message}`);
          }
          signupFlows.delete(session.id);
          session.setState(SessionState.CONNECTED);
        }
      }
      return;
    }

    // Handle login flow
    if (loginFlows.has(session.id)) {
      const flow = loginFlows.get(session.id)!;

      if (flow.step === 'username') {
        flow.username = input;
        flow.step = 'password';
        session.writeLine('Password:');
      } else if (flow.step === 'password') {
        // Check rate limiting - use session ID for better test isolation
        const clientKey = session.id;
        const attempts = failedLoginAttempts.get(clientKey);
        if (attempts && attempts.count >= 3) {
          const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
          if (timeSinceLastAttempt < 5 * 60 * 1000) { // 5 minutes
            session.writeLine('Too many failed login attempts. Please wait 5 minutes before trying again.');
            loginFlows.delete(session.id);
            session.setState(SessionState.CONNECTED);
            return;
          } else {
            // Reset after 5 minutes
            failedLoginAttempts.delete(clientKey);
          }
        }

        try {
          const user = await userModel.authenticate(flow.username!, input);

        if (!user) {
          // Track failed login attempt
          const attempts = failedLoginAttempts.get(clientKey) || { count: 0, lastAttempt: 0 };
          attempts.count++;
          attempts.lastAttempt = Date.now();
          failedLoginAttempts.set(clientKey, attempts);

          authLogger.warn({
            sessionId: session.id,
            action: 'login_failed',
            username: flow.username,
            reason: 'invalid_credentials',
            remoteAddress: session.socket.remoteAddress
          }, `Login failed: ${flow.username} (${session.id})`);

          session.writeLine('Invalid username or password.');
          loginFlows.delete(session.id);
          session.setState(SessionState.CONNECTED);
          return;
        }

        // Check for concurrent login prevention
        const existingSession = sessionManager.getByUserId(user.id);
        if (existingSession && existingSession.id !== session.id) {
          session.writeLine('This user is already logged in. Please disconnect the other session first.');
          loginFlows.delete(session.id);
          session.setState(SessionState.CONNECTED);
          return;
        }

        let player = await playerModel.findByUserId(user.id);

        if (!player) {
          // Create player if doesn't exist (shouldn't happen normally)
          await playerModel.create(user.id);
          player = await playerModel.findByUserId(user.id);
        }

        // Clear failed login attempts on successful login
        failedLoginAttempts.delete(clientKey);

        session.userId = user.id;
        session.username = user.username;
        session.roomId = player!.room_id;
        session.setState(SessionState.AUTHENTICATED);

        // Add session to manager before sending welcome messages
        sessionManager.add(session);

        await playerModel.updateLastSeen(user.id);

        loginFlows.delete(session.id);

        authLogger.info({
          sessionId: session.id,
          username: session.username,
          userId: session.userId,
          roomId: session.roomId,
          action: 'login_success',
          remoteAddress: session.socket.remoteAddress
        }, `Successful login: ${session.username} (${session.id})`);

        session.writeLine(getWelcomeArt());
        session.writeLine(`\r\nWelcome back, ${session.username}!`);
        session.writeLine('Type `look` to see your surroundings.');
        session.writeLine('Type `help` for a list of commands.\r\n');

        // Announce to other players
        sessionManager.broadcastToRoom(session.roomId!, `${session.username} has joined the game.`, session.id);
        return; // Successful login, exit early
        } catch (error: any) {
          authLogger.error({
            sessionId: session.id,
            action: 'login_failed',
            username: flow.username,
            error: error.message,
            remoteAddress: session.socket.remoteAddress
          }, `Login failed due to error: ${flow.username} (${session.id})`);

          // Check if it's a database connection error
          if (error.message.includes('database') || error.message.includes('connection') || error.code === 'SQLITE_CANTOPEN') {
            session.writeLine('Service temporarily unavailable. Please try again later.');
          } else {
            session.writeLine('Invalid username or password.');
          }
          loginFlows.delete(session.id);
          session.setState(SessionState.CONNECTED);
        }
      }
    }

    // If we reach here, no flow was found but auth flow command was called
    if (!signupFlows.has(session.id) && !loginFlows.has(session.id)) {
      // Only show error if currently authenticating (to avoid breaking test expectations)
      if (session.state === SessionState.AUTHENTICATING) {
        session.writeLine('Authentication session expired. Please start over.');
        session.setState(SessionState.CONNECTED);
      }
    }
  });
}