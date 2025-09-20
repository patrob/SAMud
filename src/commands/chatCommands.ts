import { Session, SessionState } from '../server/session';
import { CommandDispatcher } from './commandDispatcher';
import { Player } from '../models/player';
import { Room } from '../models/room';
import { chatLogger } from '../utils/logger';

export function registerChatCommands(dispatcher: CommandDispatcher, sessionManager: any) {
  const playerModel = new Player();
  const roomModel = new Room();

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

    chatLogger.info({
      sessionId: session.id,
      username: session.username,
      userId: session.userId,
      roomId: session.roomId,
      messageLength: message.length,
      type: 'room_chat'
    }, `Room chat: ${session.username} in room ${session.roomId}`);

    // Send to current user with simple formatting
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

    chatLogger.info({
      sessionId: session.id,
      username: session.username,
      userId: session.userId,
      roomId: session.roomId,
      messageLength: message.length,
      type: 'global_shout'
    }, `Global shout: ${session.username}`);

    // Send to current user with simple formatting
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
      // Get only authenticated sessions from session manager
      const authenticatedSessions = sessionManager.getAuthenticated();

      if (authenticatedSessions.length === 0) {
        session.writeLine('No players are currently online.');
        return;
      }

      session.writeLine('\r\n=== Online Players ===');
      for (const authSession of authenticatedSessions) {
        if (authSession.username && authSession.roomId !== undefined) {
          // Get room name from database
          const room = await roomModel.findById(authSession.roomId);
          const location = room ? room.name : `Room #${authSession.roomId}`;
          session.writeLine(`${authSession.username} - ${location}`);
        }
      }
      session.writeLine(`Total: ${authenticatedSessions.length} player(s) online\r\n`);
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

    chatLogger.info({
      sessionId: session.id,
      username: session.username,
      userId: session.userId,
      roomId: session.roomId,
      actionLength: action.length,
      type: 'emote'
    }, `Emote: ${session.username} in room ${session.roomId}`);

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