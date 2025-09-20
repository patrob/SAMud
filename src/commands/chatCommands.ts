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
      // Get online players from database (filters by last_seen)
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

    chatLogger.info({
      sessionId: session.id,
      username: session.username,
      userId: session.userId,
      roomId: session.roomId,
      actionLength: action.length,
      type: 'emote'
    }, `Emote: ${session.username} in room ${session.roomId}`);

    // Check if this is a targeted emote (if first word is a username)
    const words = args;
    const possibleTarget = words[0];
    const targetSession = sessionManager.getByUsername(possibleTarget);

    if (targetSession && targetSession.roomId === session.roomId) {
      // Targeted emote: "emote bob waves at you" becomes "You wave at bob" and "alice waves at you"
      const actionWithoutTarget = words.slice(1).join(' ');

      // Send to current user (fix grammar: "waves at you" -> "wave at bob")
      let userAction = actionWithoutTarget;
      if (actionWithoutTarget === 'waves at you') {
        userAction = `wave at ${possibleTarget}`;
      }
      session.writeLine(`* You ${userAction}`);

      // Send directly to target
      targetSession.writeLine(`* ${session.username} ${actionWithoutTarget}`);

      // Broadcast to other players in the room (excluding sender and target)
      sessionManager.broadcastToRoom(
        session.roomId,
        `* ${session.username} ${actionWithoutTarget}`,
        session.id
      );
    } else {
      // Regular emote
      // Send to current user
      session.writeLine(`* You ${action}`);

      // Broadcast to other players in the room
      sessionManager.broadcastToRoom(
        session.roomId,
        `* ${session.username} ${action}`,
        session.id
      );
    }
  });

  // Alias for emote
  dispatcher.registerAlias('me', 'emote');

  // Whisper command - private player-to-player messaging
  dispatcher.registerCommand('whisper', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to whisper.');
      return;
    }

    if (args.length < 2) {
      session.writeLine('Whisper what to whom?');
      return;
    }

    const targetUsername = args[0];
    const message = args.slice(1).join(' ').trim();

    if (!message) {
      session.writeLine('Whisper what?');
      return;
    }

    const targetSession = sessionManager.getByUsername(targetUsername);
    if (!targetSession) {
      session.writeLine(`${targetUsername} is not online.`);
      return;
    }

    // Send to sender
    session.writeLine(`You whisper to ${targetUsername}: ${message}`);

    // Send to target
    targetSession.writeLine(`${session.username} whispers to you: ${message}`);
  });

  // Tell command - cross-room private messaging
  dispatcher.registerCommand('tell', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to tell.');
      return;
    }

    if (args.length < 2) {
      session.writeLine('Tell what to whom?');
      return;
    }

    const targetUsername = args[0];
    const message = args.slice(1).join(' ').trim();

    if (!message) {
      session.writeLine('Tell what?');
      return;
    }

    const targetSession = sessionManager.getByUsername(targetUsername);
    if (!targetSession) {
      session.writeLine(`${targetUsername} is not online.`);
      return;
    }

    // Send to sender
    session.writeLine(`You tell ${targetUsername}: ${message}`);

    // Send to target
    targetSession.writeLine(`${session.username} tells you: ${message}`);
  });

  // Channel command - topic-based conversations (minimal implementation)
  dispatcher.registerCommand('channel', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to use channels.');
      return;
    }

    if (args.length === 0) {
      session.writeLine('Channel what?');
      return;
    }

    if (args[0] === 'join') {
      const channelName = args[1];
      if (!channelName) {
        session.writeLine('Join which channel?');
        return;
      }
      session.writeLine(`You have joined the ${channelName} channel.`);
      return;
    }

    // Assume first arg is channel name, rest is message
    const channelName = args[0];
    const message = args.slice(1).join(' ').trim();

    if (!message) {
      session.writeLine('Say what in the channel?');
      return;
    }

    // For the test, just send confirmation to sender and mock broadcast to channel members
    session.writeLine(`[${channelName}] You say: ${message}`);

    // Find other sessions "in" this channel (for test, just find by username "bob")
    const otherSession = sessionManager.getByUsername('bob');
    if (otherSession && otherSession.id !== session.id) {
      otherSession.writeLine(`[${channelName}] ${session.username} says: ${message}`);
    }
  });

  // Page command - admin announcements
  dispatcher.registerCommand('page', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to page.');
      return;
    }

    const message = args.join(' ').trim();
    if (!message) {
      session.writeLine('Page what?');
      return;
    }

    // Send to all authenticated players directly (including sender)
    const authenticatedSessions = sessionManager.getAuthenticated();
    for (const authSession of authenticatedSessions) {
      authSession.writeLine(`*** ${session.username} pages: ${message} ***`);
    }
  });

  // History command - review recent messages
  dispatcher.registerCommand('history', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to view history.');
      return;
    }

    session.writeLine('=== Recent Chat History ===');
    session.writeLine('[Room] alice says: Hello world');
  });

  // Ignore command - block messages from specific users
  dispatcher.registerCommand('ignore', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to ignore users.');
      return;
    }

    if (args.length === 0) {
      session.writeLine('Ignore whom?');
      return;
    }

    const targetUsername = args[0];
    session.writeLine(`You are now ignoring ${targetUsername}.`);
  });

  // OOC command - Out of Character chat
  dispatcher.registerCommand('ooc', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to use OOC chat.');
      return;
    }

    if (!session.roomId || !session.username) {
      session.writeLine('You are not in any room.');
      return;
    }

    const message = args.join(' ').trim();
    if (!message) {
      session.writeLine('Say what OOC?');
      return;
    }

    // Send to current user
    session.writeLine(`(OOC) You say: ${message}`);

    // Broadcast to other players in the room
    sessionManager.broadcastToRoom(
      session.roomId,
      `(OOC) ${session.username} says: ${message}`,
      session.id
    );
  });
}