import net, { Server, Socket } from 'net';
import { Session, SessionState } from './session';
import { SessionManager } from './sessionManager';
import { CommandDispatcher } from '../commands/commandDispatcher';
import { registerBasicCommands } from '../commands/basicCommands';
import { registerAuthCommands } from '../commands/authCommands';
import { registerWorldCommands } from '../commands/worldCommands';
import { registerChatCommands } from '../commands/chatCommands';
import { registerNPCCommands } from '../commands/npcCommands';
import { MudDatabase } from '../database/db';
import { Player } from '../models/player';
import { AutosaveManager } from '../utils/autosave';
import { OllamaClient } from '../services/ollamaClient';
import { serverLogger } from '../utils/logger';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 2323;

export class MudServer {
  private server: Server;
  private sessionManager: SessionManager;
  private dispatcher: CommandDispatcher;
  private database: MudDatabase;
  private playerModel: Player;
  private autosaveManager: AutosaveManager;
  private ollamaClient: OllamaClient;

  constructor() {
    this.server = net.createServer();
    this.sessionManager = new SessionManager();
    this.dispatcher = new CommandDispatcher();
    this.database = MudDatabase.getInstance();
    this.playerModel = new Player();
    this.autosaveManager = new AutosaveManager(this.sessionManager);
    this.ollamaClient = new OllamaClient();
    this.setupCommands();
  }

  private showWelcomeBanner(session: Session) {
    session.writeLine('\r\n');
    session.writeLine('\x1b[36m+======================================================================+\x1b[0m');
    session.writeLine('\x1b[36m|                                                                      |\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m█████╗  ████████╗  ██████╗\x1b[0m                                      \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m██╔══██╗ ╚══██╔══╝ ██╔════╝\x1b[0m                                      \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m███████║    ██║    ██║\x1b[0m                                           \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m██╔══██║    ██║    ██║\x1b[0m                                           \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m██║  ██║    ██║    ╚██████╗\x1b[0m                                      \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m╚═╝  ╚═╝    ╚═╝     ╚═════╝\x1b[0m                                      \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|                                                                      |\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m███╗   ███╗ ██╗   ██╗ ██████╗\x1b[0m                                   \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m████╗ ████║ ██║   ██║ ██╔══██╗\x1b[0m                                  \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m██╔████╔██║ ██║   ██║ ██║  ██║\x1b[0m                                  \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m██║╚██╔╝██║ ██║   ██║ ██║  ██║\x1b[0m                                  \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m██║ ╚═╝ ██║ ╚██████╔╝ ██████╔╝\x1b[0m                                  \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m \x1b[93m╚═╝     ╚═╝  ╚═════╝  ╚═════╝\x1b[0m                                   \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|                                                                      |\x1b[0m');
    session.writeLine('\x1b[36m|\x1b[0m                \x1b[97mAlamo Tech Collective Multiuser Dungeon\x1b[0m                \x1b[36m|\x1b[0m');
    session.writeLine('\x1b[36m|                                                                      |\x1b[0m');
    session.writeLine('\x1b[36m+======================================================================+\x1b[0m');
    session.writeLine('');
    session.writeLine('\x1b[42m\x1b[30m Welcome to Claude Code style interface! \x1b[0m');
    session.writeLine('');
    session.writeLine('\x1b[96mCommands:\x1b[0m');
    session.writeLine('  \x1b[93mlogin\x1b[0m    - Login to your existing account');
    session.writeLine('  \x1b[93msignup\x1b[0m   - Create a new account');
    session.writeLine('  \x1b[93mhelp\x1b[0m     - Show available commands');
    session.writeLine('  \x1b[93mquit\x1b[0m     - Exit the game');
    session.writeLine('');
    session.prompt();
  }

  private setupCommands() {
    registerBasicCommands(this.dispatcher, this.sessionManager);
    registerAuthCommands(this.dispatcher, this.sessionManager);
    registerWorldCommands(this.dispatcher, this.sessionManager);
    registerChatCommands(this.dispatcher, this.sessionManager);
    registerNPCCommands(this.dispatcher, this.sessionManager);
  }

  private handleNewConnection(socket: Socket) {
    const session = new Session(socket);
    this.sessionManager.add(session);

    serverLogger.info({
      sessionId: session.id,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      totalSessions: this.sessionManager.getAll().length
    }, `New connection established: ${session.id} from ${socket.remoteAddress}:${socket.remotePort}`);

    // Show enhanced banner with ASCII art
    this.showWelcomeBanner(session);

    // Handle incoming lines
    session.on('line', async (line: string) => {
      // Handle authentication flow separately
      if (session.state === SessionState.AUTHENTICATING) {
        await this.dispatcher.dispatch(session, '__auth_flow__ ' + line);
      } else {
        await this.dispatcher.dispatch(session, line);
      }
      if (session.state !== SessionState.DISCONNECTED) {
        await session.claudePrompt();
      }
    });

    // Handle disconnection
    session.on('disconnect', async () => {
      const sessionDuration = Date.now() - session.getLastActivity();

      serverLogger.info({
        sessionId: session.id,
        username: session.username,
        userId: session.userId,
        roomId: session.roomId,
        sessionDuration,
        totalSessions: this.sessionManager.getAll().length - 1,
        wasAuthenticated: session.state === SessionState.AUTHENTICATED
      }, `Session disconnected: ${session.id} (duration: ${Math.round(sessionDuration / 1000)}s)`);

      // Save player state if authenticated
      if (session.userId && session.roomId !== undefined) {
        try {
          await this.playerModel.updateRoom(session.userId, session.roomId);
          await this.playerModel.updateLastSeen(session.userId);

          serverLogger.debug({
            sessionId: session.id,
            username: session.username,
            userId: session.userId,
            roomId: session.roomId
          }, `Player state saved on disconnect: ${session.username}`);

          // Announce departure to room
          if (session.username) {
            this.sessionManager.broadcastToRoom(
              session.roomId,
              `${session.username} has left the game.`,
              session.id
            );
          }
        } catch (error) {
          serverLogger.error({
            sessionId: session.id,
            username: session.username,
            userId: session.userId,
            error: error instanceof Error ? error.message : String(error)
          }, `Error saving player state on disconnect: ${session.username}`);
        }
      }

      this.sessionManager.remove(session.id);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on('connection', (socket) => this.handleNewConnection(socket));

      this.server.on('error', (err) => {
        serverLogger.error({
          error: err.message,
          stack: err.stack,
          port: PORT
        }, `Server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(PORT, '0.0.0.0', async () => {
        serverLogger.info({
          port: PORT,
          address: '0.0.0.0'
        }, `San Antonio MUD server listening on port ${PORT}`);

        // Test Ollama connection
        try {
          const isOllamaAvailable = await this.ollamaClient.healthCheck();
          if (isOllamaAvailable) {
            const models = await this.ollamaClient.listModels();
            serverLogger.info({
              available: true,
              models: models.length
            }, `Ollama service connected (${models.length} models available)`);
          } else {
            serverLogger.warn('Ollama service not available - NPCs will use fallback responses');
          }
        } catch (error) {
          serverLogger.warn({
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Ollama service connection failed - NPCs will use fallback responses');
        }

        // Start autosave
        this.autosaveManager.start();
        serverLogger.info('Autosave manager started');

        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const activeSessions = this.sessionManager.getAll();

    serverLogger.info({
      activeSessions: activeSessions.length,
      authenticatedSessions: activeSessions.filter(s => s.state === SessionState.AUTHENTICATED).length
    }, 'Initiating server shutdown');

    // Stop autosave
    this.autosaveManager.stop();
    serverLogger.info('Autosave manager stopped');

    // Save all players before shutdown
    await this.autosaveManager.saveAllPlayers();
    serverLogger.info('All player states saved');

    // Disconnect all sessions
    for (const session of activeSessions) {
      session.writeLine('Server is shutting down...');
      session.disconnect();
    }

    serverLogger.info(`Disconnected ${activeSessions.length} active sessions`);

    return new Promise((resolve) => {
      this.server.close(() => {
        serverLogger.info('Server stopped successfully');
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