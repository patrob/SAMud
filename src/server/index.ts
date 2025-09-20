// Server layer - TCP/Telnet handling

import * as net from 'net';
import { Session } from '../types';
import { GameManager } from '../game';

export class TelnetServer {
  private server: net.Server;
  private sessions: Map<string, Session> = new Map();
  private port: number;
  private gameManager: GameManager;
  private presenceMap: Map<number, Set<string>> = new Map(); // roomId -> Set<sessionIds>

  constructor(port: number = 2323, dbPath?: string) {
    this.port = port;
    this.gameManager = new GameManager(dbPath);
    this.server = net.createServer(this.handleConnection.bind(this));
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private handleConnection(socket: net.Socket): void {
    const sessionId = this.generateSessionId();
    const session: Session = {
      id: sessionId,
      socket,
      authenticated: false,
      buffer: ''
    };

    this.sessions.set(sessionId, session);
    console.log(`New connection: ${sessionId} from ${socket.remoteAddress}`);

    // Send welcome banner
    this.sendToSession(session, 'Welcome to the San Antonio MUD');
    this.sendToSession(session, 'Type `login` or `signup` to begin');
    this.sendPrompt(session);

    // Handle incoming data
    socket.on('data', (data) => this.handleData(session, data));
    
    // Handle disconnect
    socket.on('close', () => this.handleDisconnect(session));
    socket.on('error', (err) => {
      console.error(`Socket error for session ${sessionId}:`, err);
      this.handleDisconnect(session);
    });
  }

  private handleData(session: Session, data: Buffer): void {
    const text = data.toString('utf8');
    
    // Add to buffer and process complete lines
    session.buffer += text;
    
    let newlineIndex;
    while ((newlineIndex = session.buffer.indexOf('\n')) !== -1) {
      const line = session.buffer.substring(0, newlineIndex).replace(/\r/g, '');
      session.buffer = session.buffer.substring(newlineIndex + 1);
      
      if (line.trim()) {
        this.processCommand(session, line.trim());
      }
    }
  }

  private async processCommand(session: Session, input: string): Promise<void> {
    const args = input.split(' ');
    const command = args.shift()?.toLowerCase() || '';

    console.log(`Session ${session.id}: ${input}`);

    // Handle state-based commands (waiting for username/password)
    if (session.awaitingInput) {
      await this.handleAwaitedInput(session, input);
      return;
    }

    switch (command) {
      case 'help':
        this.handleHelp(session);
        this.sendPrompt(session);
        break;
      case 'signup':
        this.handleSignupStart(session);
        break;
      case 'login':
        this.handleLoginStart(session);
        break;
      case 'look':
        if (session.authenticated) {
          this.handleLook(session);
        } else {
          this.sendToSession(session, 'You must be logged in to look around.');
        }
        this.sendPrompt(session);
        break;
      case 'where':
        if (session.authenticated) {
          this.handleWhere(session);
        } else {
          this.sendToSession(session, 'You must be logged in to see where you are.');
        }
        this.sendPrompt(session);
        break;
      case 'move':
      case 'go':
        if (session.authenticated) {
          const direction = args[0] || 'invalid';
          this.handleMove(session, direction);
        } else {
          this.sendToSession(session, 'You must be logged in to move around.');
        }
        this.sendPrompt(session);
        break;
      case 'n':
      case 'north':
        if (session.authenticated) {
          this.handleMove(session, 'north');
        } else {
          this.sendToSession(session, 'You must be logged in to move around.');
        }
        this.sendPrompt(session);
        break;
      case 's':
      case 'south':
        if (session.authenticated) {
          this.handleMove(session, 'south');
        } else {
          this.sendToSession(session, 'You must be logged in to move around.');
        }
        this.sendPrompt(session);
        break;
      case 'e':
      case 'east':
        if (session.authenticated) {
          this.handleMove(session, 'east');
        } else {
          this.sendToSession(session, 'You must be logged in to move around.');
        }
        this.sendPrompt(session);
        break;
      case 'w':
      case 'west':
        if (session.authenticated) {
          this.handleMove(session, 'west');
        } else {
          this.sendToSession(session, 'You must be logged in to move around.');
        }
        this.sendPrompt(session);
        break;
      case 'say':
        if (session.authenticated) {
          const message = args.join(' ');
          this.handleSay(session, message);
        } else {
          this.sendToSession(session, 'You must be logged in to speak.');
        }
        this.sendPrompt(session);
        break;
      case 'shout':
        if (session.authenticated) {
          const message = args.join(' ');
          this.handleShout(session, message);
        } else {
          this.sendToSession(session, 'You must be logged in to shout.');
        }
        this.sendPrompt(session);
        break;
      case 'who':
        if (session.authenticated) {
          this.handleWho(session);
        } else {
          this.sendToSession(session, 'You must be logged in to see who is online.');
        }
        this.sendPrompt(session);
        break;
      case 'quit':
        this.handleQuit(session);
        return; // Don't send prompt after quit
      default:
        this.sendToSession(session, `Unknown command: ${command}`);
        this.sendToSession(session, 'Type `help` for available commands.');
        this.sendPrompt(session);
        break;
    }
  }

  private async handleAwaitedInput(session: Session, input: string): Promise<void> {
    const state = session.awaitingInput;
    
    switch (state?.type) {
      case 'signup_username':
        await this.handleSignupUsername(session, input);
        break;
      case 'signup_password':
        await this.handleSignupPassword(session, input);
        break;
      case 'login_username':
        await this.handleLoginUsername(session, input);
        break;
      case 'login_password':
        await this.handleLoginPassword(session, input);
        break;
    }
  }

  private handleSignupStart(session: Session): void {
    this.sendToSession(session, 'Choose a username:');
    session.awaitingInput = { type: 'signup_username' };
    this.sendPrompt(session);
  }

  private async handleSignupUsername(session: Session, username: string): Promise<void> {
    if (!username || username.length < 3) {
      this.sendToSession(session, 'Username must be at least 3 characters long.');
      this.sendToSession(session, 'Choose a username:');
      this.sendPrompt(session);
      return;
    }

    session.awaitingInput = { type: 'signup_password', data: { username } };
    this.sendToSession(session, 'Choose a password:');
    this.sendPrompt(session);
  }

  private async handleSignupPassword(session: Session, password: string): Promise<void> {
    if (!password || password.length < 6) {
      this.sendToSession(session, 'Password must be at least 6 characters long.');
      this.sendToSession(session, 'Choose a password:');
      this.sendPrompt(session);
      return;
    }

    const username = session.awaitingInput?.data?.username;
    session.awaitingInput = undefined;

    const success = await this.gameManager.handleSignup(session, username, password);
    
    if (success) {
      this.sendToSession(session, `Account created. Welcome, ${session.player?.username}!`);
      this.sendToSession(session, '');
      this.addToPresence(session);
      this.showRoom(session);
      this.announceRoomEntry(session);
    } else {
      this.sendToSession(session, 'Failed to create account. Username may already exist.');
    }
    
    this.sendPrompt(session);
  }

  private handleLoginStart(session: Session): void {
    this.sendToSession(session, 'Username:');
    session.awaitingInput = { type: 'login_username' };
    this.sendPrompt(session);
  }

  private async handleLoginUsername(session: Session, username: string): Promise<void> {
    session.awaitingInput = { type: 'login_password', data: { username } };
    this.sendToSession(session, 'Password:');
    this.sendPrompt(session);
  }

  private async handleLoginPassword(session: Session, password: string): Promise<void> {
    const username = session.awaitingInput?.data?.username;
    session.awaitingInput = undefined;

    const success = await this.gameManager.handleLogin(session, username, password);
    
    if (success) {
      this.sendToSession(session, `Welcome back, ${session.player?.username}!`);
      this.sendToSession(session, '');
      this.addToPresence(session);
      this.showRoom(session);
      this.announceRoomEntry(session);
    } else {
      this.sendToSession(session, 'Invalid username or password.');
    }
    
    this.sendPrompt(session);
  }

  private handleHelp(session: Session): void {
    this.sendToSession(session, 'Available commands:');
    
    if (!session.authenticated) {
      this.sendToSession(session, '  signup - Create a new account');
      this.sendToSession(session, '  login  - Log into existing account');
    } else {
      this.sendToSession(session, '  look   - Look around the current room');
      this.sendToSession(session, '  where  - Show your current location');
      this.sendToSession(session, '  move <direction> - Move in a direction');
      this.sendToSession(session, '  n, s, e, w - Move north, south, east, west');
      this.sendToSession(session, '  say <message> - Say something to players in the room');
      this.sendToSession(session, '  shout <message> - Shout to all players in the world');
      this.sendToSession(session, '  who    - Show who is online');
    }
    
    this.sendToSession(session, '  help   - Show this help message');
    this.sendToSession(session, '  quit   - Disconnect from the server');
  }

  private showRoom(session: Session): void {
    const roomInfo = this.gameManager.handleLook(session);
    for (const line of roomInfo) {
      this.sendToSession(session, line);
    }
  }

  private handleLook(session: Session): void {
    const roomInfo = this.gameManager.handleLook(session);
    for (const line of roomInfo) {
      this.sendToSession(session, line);
    }
  }

  private handleWhere(session: Session): void {
    const whereInfo = this.gameManager.handleWhere(session);
    for (const line of whereInfo) {
      this.sendToSession(session, line);
    }
  }

  private handleMove(session: Session, direction: string): void {
    if (!session.player) return;
    
    const oldRoomId = session.player.currentRoomId;
    const moveResult = this.gameManager.handleMove(session, direction);
    
    // Check if move was successful (room changed)
    if (session.player.currentRoomId !== oldRoomId) {
      this.announceRoomExit(session);
      this.updatePresence(session, oldRoomId, session.player.currentRoomId);
      this.announceRoomEntry(session);
    }
    
    for (const line of moveResult) {
      this.sendToSession(session, line);
    }
  }

  private handleSay(session: Session, message: string): void {
    if (!session.player || !message.trim()) {
      this.sendToSession(session, 'Say what?');
      return;
    }

    const roomMessage = `[Room] ${session.player.username}: ${message}`;
    
    // Send to the speaker
    this.sendToSession(session, roomMessage);
    
    // Broadcast to others in the room
    this.broadcastToRoom(session.player.currentRoomId, roomMessage, session.id);
  }

  private handleShout(session: Session, message: string): void {
    if (!session.player || !message.trim()) {
      this.sendToSession(session, 'Shout what?');
      return;
    }

    const globalMessage = `[Global] ${session.player.username}: ${message}`;
    
    // Send to the shouter
    this.sendToSession(session, globalMessage);
    
    // Broadcast to all other authenticated players
    this.broadcastGlobal(globalMessage, session.id);
  }

  private handleWho(session: Session): void {
    const onlinePlayers: string[] = [];
    
    for (const otherSession of this.sessions.values()) {
      if (otherSession.authenticated && otherSession.player) {
        onlinePlayers.push(otherSession.player.username);
      }
    }

    if (onlinePlayers.length === 0) {
      this.sendToSession(session, 'No one is online.');
    } else {
      this.sendToSession(session, `Online: ${onlinePlayers.join(', ')}`);
    }
  }

  private handleQuit(session: Session): void {
    if (session.authenticated && session.player) {
      this.gameManager.handleQuit(session);
      this.sendToSession(session, `Goodbye, ${session.player.username}. Your progress has been saved.`);
    } else {
      this.sendToSession(session, 'Goodbye!');
    }
    session.socket.end();
  }

  private handleDisconnect(session: Session): void {
    if (this.sessions.has(session.id)) {
      if (session.authenticated && session.player) {
        this.announceRoomExit(session);
        this.removeFromPresence(session);
        this.gameManager.handleQuit(session);
      }
      console.log(`Session disconnected: ${session.id}`);
      this.sessions.delete(session.id);
    }
  }

  private addToPresence(session: Session): void {
    if (!session.player) return;
    
    const roomId = session.player.currentRoomId;
    if (!this.presenceMap.has(roomId)) {
      this.presenceMap.set(roomId, new Set());
    }
    this.presenceMap.get(roomId)!.add(session.id);
  }

  private removeFromPresence(session: Session): void {
    if (!session.player) return;
    
    const roomId = session.player.currentRoomId;
    const roomSessions = this.presenceMap.get(roomId);
    if (roomSessions) {
      roomSessions.delete(session.id);
      if (roomSessions.size === 0) {
        this.presenceMap.delete(roomId);
      }
    }
  }

  private updatePresence(session: Session, oldRoomId: number, newRoomId: number): void {
    // Remove from old room
    const oldRoomSessions = this.presenceMap.get(oldRoomId);
    if (oldRoomSessions) {
      oldRoomSessions.delete(session.id);
      if (oldRoomSessions.size === 0) {
        this.presenceMap.delete(oldRoomId);
      }
    }

    // Add to new room
    if (!this.presenceMap.has(newRoomId)) {
      this.presenceMap.set(newRoomId, new Set());
    }
    this.presenceMap.get(newRoomId)!.add(session.id);
  }

  private announceRoomEntry(session: Session): void {
    if (!session.player) return;
    
    const roomId = session.player.currentRoomId;
    const roomSessions = this.presenceMap.get(roomId);
    
    if (roomSessions) {
      const message = `${session.player.username} arrives.`;
      for (const sessionId of roomSessions) {
        const otherSession = this.sessions.get(sessionId);
        if (otherSession && otherSession.id !== session.id) {
          this.sendToSession(otherSession, message);
        }
      }
    }
  }

  private announceRoomExit(session: Session): void {
    if (!session.player) return;
    
    const roomId = session.player.currentRoomId;
    const roomSessions = this.presenceMap.get(roomId);
    
    if (roomSessions) {
      const message = `${session.player.username} leaves.`;
      for (const sessionId of roomSessions) {
        const otherSession = this.sessions.get(sessionId);
        if (otherSession && otherSession.id !== session.id) {
          this.sendToSession(otherSession, message);
        }
      }
    }
  }

  private broadcastToRoom(roomId: number, message: string, excludeSessionId?: string): void {
    const roomSessions = this.presenceMap.get(roomId);
    if (roomSessions) {
      for (const sessionId of roomSessions) {
        if (sessionId !== excludeSessionId) {
          const session = this.sessions.get(sessionId);
          if (session) {
            this.sendToSession(session, message);
          }
        }
      }
    }
  }

  private broadcastGlobal(message: string, excludeSessionId?: string): void {
    for (const session of this.sessions.values()) {
      if (session.authenticated && session.id !== excludeSessionId) {
        this.sendToSession(session, message);
      }
    }
  }

  public sendToSession(session: Session, message: string): void {
    if (session.socket && !session.socket.destroyed) {
      session.socket.write(message + '\r\n');
    }
  }

  private sendPrompt(session: Session): void {
    if (session.socket && !session.socket.destroyed) {
      session.socket.write('\r\n> ');
    }
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Telnet server listening on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all active sessions
      for (const session of this.sessions.values()) {
        if (session.authenticated && session.player) {
          this.gameManager.handleQuit(session);
        }
        session.socket.end();
      }
      this.sessions.clear();

      this.gameManager.close();

      this.server.close(() => {
        console.log('Telnet server stopped');
        resolve();
      });
    });
  }

  public getActiveSessions(): Session[] {
    return Array.from(this.sessions.values());
  }
}