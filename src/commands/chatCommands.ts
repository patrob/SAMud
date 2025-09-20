import { Session, SessionState } from '../server/session';
import { CommandDispatcher } from './commandDispatcher';
import { Player } from '../models/player';

export function registerChatCommands(dispatcher: CommandDispatcher, sessionManager: any) {
  const playerModel = new Player();

  // Say command - room chat
  dispatcher.registerCommand('say', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to speak.');
      return;
    }

    if (!session.roomId || !session.username) {
      session.writeLine('You are not in any room.');
      return;
    }

    const message = args.join(' ').trim();
    if (!message) {
      session.writeLine('Say what?');
      return;
    }

    // Send to current user
    session.writeLine(`[Room] You say: ${message}`);

    // Broadcast to other players in the room
    sessionManager.broadcastToRoom(
      session.roomId,
      `[Room] ${session.username} says: ${message}`,
      session.id
    );
  });

  // Shout command - global chat
  dispatcher.registerCommand('shout', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to shout.');
      return;
    }

    if (!session.username) {
      session.writeLine('You are not properly logged in.');
      return;
    }

    const message = args.join(' ').trim();
    if (!message) {
      session.writeLine('Shout what?');
      return;
    }

    // Send to current user
    session.writeLine(`[Global] You shout: ${message}`);

    // Broadcast to all authenticated players
    sessionManager.broadcastToAuthenticated(
      `[Global] ${session.username} shouts: ${message}`,
      session.id
    );
  });

  // Who command - show online players
  dispatcher.registerCommand('who', async (session: Session) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to see who is online.');
      return;
    }

    try {
      const onlinePlayers = await playerModel.getOnlinePlayers();

      if (onlinePlayers.length === 0) {
        session.writeLine('No players are currently online.');
        return;
      }

      session.writeLine('\r\n=== Online Players ===');
      for (const player of onlinePlayers) {
        const location = player.room_name || `Room #${player.room_id}`;
        session.writeLine(`${player.username} - ${location}`);
      }
      session.writeLine(`Total: ${onlinePlayers.length} player(s) online\r\n`);
    } catch (error) {
      console.error('Error getting online players:', error);
      session.writeLine('Error retrieving online players.');
    }
  });

  // Emote command (bonus)
  dispatcher.registerCommand('emote', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to emote.');
      return;
    }

    if (!session.roomId || !session.username) {
      session.writeLine('You are not in any room.');
      return;
    }

    const action = args.join(' ').trim();
    if (!action) {
      session.writeLine('Emote what?');
      return;
    }

    // Send to current user
    session.writeLine(`* You ${action}`);

    // Broadcast to other players in the room
    sessionManager.broadcastToRoom(
      session.roomId,
      `* ${session.username} ${action}`,
      session.id
    );
  });

  // Alias for emote
  dispatcher.registerAlias('me', 'emote');
}