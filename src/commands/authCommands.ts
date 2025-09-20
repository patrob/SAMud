import { Session, SessionState } from '../server/session';
import { CommandDispatcher } from './commandDispatcher';
import { User } from '../models/user';
import { Player } from '../models/player';

interface AuthFlow {
  step: 'username' | 'password' | 'confirm_password';
  username?: string;
  password?: string;
}

const signupFlows = new Map<string, AuthFlow>();
const loginFlows = new Map<string, AuthFlow>();

export function registerAuthCommands(dispatcher: CommandDispatcher, sessionManager: any) {
  const userModel = new User();
  const playerModel = new Player();

  // Signup command
  dispatcher.registerCommand('signup', (session: Session) => {
    if (session.state === SessionState.AUTHENTICATED) {
      session.writeLine('You are already logged in.');
      return;
    }

    session.writeLine('Choose a username:');
    signupFlows.set(session.id, { step: 'username' });
    session.state = SessionState.AUTHENTICATING;
  });

  // Login command
  dispatcher.registerCommand('login', (session: Session) => {
    if (session.state === SessionState.AUTHENTICATED) {
      session.writeLine('You are already logged in.');
      return;
    }

    session.writeLine('Username:');
    loginFlows.set(session.id, { step: 'username' });
    session.state = SessionState.AUTHENTICATING;
  });

  // Handle authentication flow
  dispatcher.registerCommand('__auth_flow__', async (session: Session, args: string[]) => {
    const input = args.join(' ');

    // Handle signup flow
    if (signupFlows.has(session.id)) {
      const flow = signupFlows.get(session.id)!;

      if (flow.step === 'username') {
        if (input.length < 3 || input.length > 20) {
          session.writeLine('Username must be between 3 and 20 characters.');
          session.writeLine('Choose a username:');
          return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(input)) {
          session.writeLine('Username can only contain letters, numbers, and underscores.');
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
          session.state = SessionState.AUTHENTICATED;

          signupFlows.delete(session.id);

          session.writeLine(`\r\nAccount created. Welcome, ${session.username}!`);
          session.writeLine('\r\nYou appear at The Alamo Plaza');
          session.writeLine('Stone walls surround you. Tourists move in and out of the courtyard.');
          session.writeLine('Type `help` for a list of commands.\r\n');

          // Announce to other players
          sessionManager.broadcastToRoom(1, `${session.username} has joined the game.`, session.id);
        } catch (error: any) {
          session.writeLine(`Error: ${error.message}`);
          signupFlows.delete(session.id);
          session.state = SessionState.CONNECTED;
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
        const user = await userModel.authenticate(flow.username!, input);

        if (!user) {
          session.writeLine('Invalid username or password.');
          loginFlows.delete(session.id);
          session.state = SessionState.CONNECTED;
          return;
        }

        const player = await playerModel.findByUserId(user.id);

        if (!player) {
          // Create player if doesn't exist (shouldn't happen normally)
          await playerModel.create(user.id);
        }

        const playerData = await playerModel.findByUserId(user.id);

        session.userId = user.id;
        session.username = user.username;
        session.roomId = playerData!.room_id;
        session.state = SessionState.AUTHENTICATED;

        await playerModel.updateLastSeen(user.id);

        loginFlows.delete(session.id);

        session.writeLine(`\r\nWelcome back, ${session.username}!`);
        session.writeLine('Type `look` to see your surroundings.');
        session.writeLine('Type `help` for a list of commands.\r\n');

        // Announce to other players
        sessionManager.broadcastToRoom(session.roomId!, `${session.username} has joined the game.`, session.id);
      }
    }
  });
}