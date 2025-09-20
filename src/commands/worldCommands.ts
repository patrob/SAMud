import { Session, SessionState } from '../server/session';
import { CommandDispatcher } from './commandDispatcher';
import { Room } from '../models/room';
import { Player } from '../models/player';

export function registerWorldCommands(dispatcher: CommandDispatcher, sessionManager: any) {
  const roomModel = new Room();
  const playerModel = new Player();

  // Look command
  dispatcher.registerCommand('look', async (session: Session) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to look around.');
      return;
    }

    if (!session.roomId) {
      session.writeLine('You are not in any room.');
      return;
    }

    const roomData = await roomModel.getRoomWithExits(session.roomId);
    if (!roomData) {
      session.writeLine('This room does not exist.');
      return;
    }

    const { room, exits } = roomData;

    // Display room info
    session.writeLine(`\r\n${room.name}`);
    session.writeLine(room.description);

    // Display exits
    if (exits.length > 0) {
      const exitDirections = exits.map(exit => exit.direction).join(', ');
      session.writeLine(`Exits: ${exitDirections}`);
    } else {
      session.writeLine('Exits: none');
    }

    // Display players in room
    const playersInRoom = await playerModel.getPlayersInRoom(session.roomId);
    const otherPlayers = playersInRoom.filter(username => username !== session.username);

    if (otherPlayers.length > 0) {
      session.writeLine(`Players here: ${otherPlayers.join(', ')}`);
    } else {
      session.writeLine('Players here: none');
    }

    session.writeLine('');
  });

  // Where command
  dispatcher.registerCommand('where', async (session: Session) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to see your location.');
      return;
    }

    if (!session.roomId) {
      session.writeLine('You are not in any room.');
      return;
    }

    const room = await roomModel.findById(session.roomId);
    if (!room) {
      session.writeLine('Current location: Unknown');
      return;
    }

    session.writeLine(`Current location: ${room.name} (Room #${room.id})`);
  });

  // Move command
  dispatcher.registerCommand('move', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to move.');
      return;
    }

    if (!session.roomId) {
      session.writeLine('You are not in any room.');
      return;
    }

    let direction = args[0];
    if (!direction) {
      session.writeLine('Move where? Specify a direction (n, s, e, w, etc.)');
      return;
    }

    // Normalize direction using shortcuts
    const shortcuts = roomModel.getDirectionShortcuts();
    direction = shortcuts[direction.toLowerCase()] || direction.toLowerCase();

    // Find the exit
    const exit = await roomModel.getExitByDirection(session.roomId, direction);
    if (!exit) {
      session.writeLine(`You cannot go ${direction} from here.`);
      return;
    }

    // Get the destination room
    const destinationRoom = await roomModel.findById(exit.to_room_id);
    if (!destinationRoom) {
      session.writeLine('That exit leads nowhere.');
      return;
    }

    // Announce departure to current room
    sessionManager.broadcastToRoom(
      session.roomId,
      `${session.username} goes ${direction}.`,
      session.id
    );

    // Move the player
    const oldRoomId = session.roomId;
    session.roomId = exit.to_room_id;

    // Save to database
    if (session.userId) {
      await playerModel.updateRoom(session.userId, session.roomId);
    }

    // Announce arrival to new room
    sessionManager.broadcastToRoom(
      session.roomId,
      `${session.username} arrives from the ${roomModel.getDirectionOpposite(direction)}.`,
      session.id
    );

    // Show new room to player
    session.writeLine(`\r\nYou go ${direction}.\r\n`);
    await dispatcher.dispatch(session, 'look');
  });

  // Register movement aliases
  const shortcuts = roomModel.getDirectionShortcuts();
  for (const [shortcut, fullDirection] of Object.entries(shortcuts)) {
    if (shortcut !== fullDirection) {
      // Only register aliases that are different from the full direction
      dispatcher.registerCommand(shortcut, async (session: Session, args: string[]) => {
        await dispatcher.dispatch(session, `move ${fullDirection}`);
      });
    }
  }
}