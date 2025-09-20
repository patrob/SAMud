import { Session } from '../server/session';
import { CommandDispatcher } from './commandDispatcher';
import { Player } from '../models/player';

export function registerBasicCommands(dispatcher: CommandDispatcher, sessionManager?: any) {
  const playerModel = new Player();

  // Help command
  dispatcher.registerCommand('help', (session: Session) => {
    session.writeLine('\r\n=== Available Commands ===');

    const commandDescriptions: { [key: string]: string } = {
      'help': 'Show this help message',
      'quit': 'Save progress and disconnect',
      'look': 'View current room description',
      'say': 'Send message to players in current room',
      'shout': 'Send message to all players in the world',
      'emote': 'Perform an action (e.g., emote waves)',
      'me': 'Alias for emote',
      'who': 'List online players and their locations',
      'where': 'Show your current location',
      'move': 'Move in specified direction (e.g., move north)',
      'n': 'Move north',
      's': 'Move south',
      'e': 'Move east',
      'w': 'Move west',
      'north': 'Move north',
      'south': 'Move south',
      'east': 'Move east',
      'west': 'Move west',
      'ne': 'Move northeast',
      'nw': 'Move northwest',
      'se': 'Move southeast',
      'sw': 'Move southwest',
      'login': 'Log in to existing account',
      'signup': 'Create new account'
    };

    // Get all registered commands and sort them
    const allCommands = dispatcher.getCommandList().sort();

    // Display commands with descriptions
    for (const command of allCommands) {
      // Skip internal commands
      if (command.startsWith('__')) {
        continue;
      }

      const description = commandDescriptions[command] || 'No description available';
      const paddedCommand = command.padEnd(12);
      session.writeLine(`${paddedCommand} - ${description}`);
    }

    session.writeLine('\r\nMovement shortcuts: n/s/e/w (north/south/east/west)');
    session.writeLine('Type any command without arguments for usage help.');
    session.writeLine('========================\r\n');
  });

  // Quit command
  dispatcher.registerCommand('quit', async (session: Session) => {
    // Announce leaving to other players in the room
    if (session.username && session.roomId !== undefined && sessionManager) {
      sessionManager.broadcastToRoom(session.roomId, `${session.username} has left the game.`, session.id);
    }

    // Save player state if authenticated
    if (session.userId && session.roomId !== undefined) {
      await playerModel.updateRoom(session.userId, session.roomId);
      await playerModel.updateLastSeen(session.userId);
    }

    session.writeLine('Goodbye! Your progress has been saved.');
    session.writeLine('Connection closed.');
    session.disconnect();
  });

  // Movement aliases
  dispatcher.registerAlias('n', 'move');
  dispatcher.registerAlias('north', 'move');
  dispatcher.registerAlias('s', 'move');
  dispatcher.registerAlias('south', 'move');
  dispatcher.registerAlias('e', 'move');
  dispatcher.registerAlias('east', 'move');
  dispatcher.registerAlias('w', 'move');
  dispatcher.registerAlias('west', 'move');
}