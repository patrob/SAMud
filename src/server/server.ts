import net, { Server, Socket } from 'net';
import { Session, SessionState } from './session';
import { SessionManager } from './sessionManager';
import { CommandDispatcher } from '../commands/commandDispatcher';
import { registerBasicCommands } from '../commands/basicCommands';
import { registerAuthCommands } from '../commands/authCommands';
import { registerWorldCommands } from '../commands/worldCommands';
import { registerChatCommands } from '../commands/chatCommands';
import { MudDatabase } from '../database/db';
import { Player } from '../models/player';
import { AutosaveManager } from '../utils/autosave';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 2323;

export class MudServer {
  private server: Server;
  private sessionManager: SessionManager;
  private dispatcher: CommandDispatcher;
  private database: MudDatabase;
  private playerModel: Player;
  private autosaveManager: AutosaveManager;

  constructor() {
    this.server = net.createServer();
    this.sessionManager = new SessionManager();
    this.dispatcher = new CommandDispatcher();
    this.database = MudDatabase.getInstance();
    this.playerModel = new Player();
    this.autosaveManager = new AutosaveManager(this.sessionManager);
    this.setupCommands();
  }

  private setupCommands() {
    registerBasicCommands(this.dispatcher);
    registerAuthCommands(this.dispatcher, this.sessionManager);
    registerWorldCommands(this.dispatcher, this.sessionManager);
    registerChatCommands(this.dispatcher, this.sessionManager);
  }

  private handleNewConnection(socket: Socket) {
    const session = new Session(socket);
    this.sessionManager.add(session);

    console.log(`New connection: ${session.id} from ${socket.remoteAddress}`);

    // Show banner
    session.writeLine('\r\n=====================================');
    session.writeLine('   Welcome to the San Antonio MUD');
    session.writeLine('=====================================');
    session.writeLine('Type `login` or `signup` to begin');
    session.writeLine('Type `help` for a list of commands\r\n');
    session.prompt();

    // Handle incoming lines
    session.on('line', async (line: string) => {
      // Handle authentication flow separately
      if (session.state === SessionState.AUTHENTICATING) {
        await this.dispatcher.dispatch(session, '__auth_flow__ ' + line);
      } else {
        await this.dispatcher.dispatch(session, line);
      }
      if (session.state !== SessionState.DISCONNECTED) {
        session.prompt();
      }
    });

    // Handle disconnection
    session.on('disconnect', async () => {
      console.log(`Session ${session.id} disconnected`);

      // Save player state if authenticated
      if (session.userId && session.roomId !== undefined) {
        await this.playerModel.updateRoom(session.userId, session.roomId);
        await this.playerModel.updateLastSeen(session.userId);

        // Announce departure to room
        if (session.username) {
          this.sessionManager.broadcastToRoom(
            session.roomId,
            `${session.username} has left the game.`,
            session.id
          );
        }
      }

      this.sessionManager.remove(session.id);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on('connection', (socket) => this.handleNewConnection(socket));

      this.server.on('error', (err) => {
        console.error('Server error:', err);
        reject(err);
      });

      this.server.listen(PORT, '0.0.0.0', () => {
        console.log(`San Antonio MUD server listening on port ${PORT}`);
        console.log(`Connect using: telnet localhost ${PORT}`);

        // Start autosave
        this.autosaveManager.start();

        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Stop autosave
    this.autosaveManager.stop();

    // Save all players before shutdown
    await this.autosaveManager.saveAllPlayers();

    // Disconnect all sessions
    for (const session of this.sessionManager.getAll()) {
      session.writeLine('Server is shutting down...');
      session.disconnect();
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('Server stopped');
        resolve();
      });
    });
  }
}

let serverInstance: MudServer | null = null;

export async function startServer() {
  if (!serverInstance) {
    serverInstance = new MudServer();
    await serverInstance.start();
  }
  return serverInstance;
}

export async function stopServer() {
  if (serverInstance) {
    await serverInstance.stop();
    serverInstance = null;
  }
}