// Server layer - TCP/Telnet handling

import * as net from 'net';
import { Session } from '../types';

export class TelnetServer {
  private server: net.Server;
  private sessions: Map<string, Session> = new Map();
  private port: number;

  constructor(port: number = 2323) {
    this.port = port;
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

  private processCommand(session: Session, input: string): void {
    const args = input.split(' ');
    const command = args.shift()?.toLowerCase() || '';

    console.log(`Session ${session.id}: ${input}`);

    switch (command) {
      case 'help':
        this.handleHelp(session);
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

  private handleHelp(session: Session): void {
    this.sendToSession(session, 'Available commands:');
    this.sendToSession(session, '  help  - Show this help message');
    this.sendToSession(session, '  quit  - Disconnect from the server');
    // TODO: Add more commands as they are implemented
  }

  private handleQuit(session: Session): void {
    this.sendToSession(session, 'Goodbye!');
    session.socket.end();
  }

  private handleDisconnect(session: Session): void {
    if (this.sessions.has(session.id)) {
      console.log(`Session disconnected: ${session.id}`);
      this.sessions.delete(session.id);
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
        session.socket.end();
      }
      this.sessions.clear();

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