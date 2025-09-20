import { Socket } from 'net';
import { EventEmitter } from 'events';

export enum SessionState {
  CONNECTED = 'connected',
  AUTHENTICATING = 'authenticating',
  AUTHENTICATED = 'authenticated',
  DISCONNECTED = 'disconnected'
}

export class Session extends EventEmitter {
  public id: string;
  public socket: Socket;
  public state: SessionState;
  public userId?: number;
  public username?: string;
  public roomId?: number;
  private buffer: string = '';
  private lastActivity: number;
  private idleTimeout?: NodeJS.Timeout;
  private readonly IDLE_TIMEOUT_MS: number = 30 * 60 * 1000; // 30 minutes

  constructor(socket: Socket) {
    super();
    this.id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.socket = socket;
    this.state = SessionState.CONNECTED;
    this.lastActivity = Date.now();

    this.setupSocketHandlers();
    this.startIdleTimer();
  }

  private setupSocketHandlers() {
    this.socket.on('data', (data: Buffer) => {
      this.updateActivity();
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.socket.on('end', () => {
      this.state = SessionState.DISCONNECTED;
      this.emit('disconnect');
    });

    this.socket.on('error', (err) => {
      console.error(`Session ${this.id} error:`, err.message);
      this.state = SessionState.DISCONNECTED;
      this.emit('disconnect');
    });
  }

  private processBuffer() {
    let newlineIndex;
    while ((newlineIndex = this.buffer.search(/\r?\n/)) !== -1) {
      const line = this.buffer.substring(0, newlineIndex).trim();
      this.buffer = this.buffer.substring(newlineIndex + 1);

      if (line.length > 0) {
        this.emit('line', line);
      }
    }
  }

  write(message: string) {
    if (this.socket.writable) {
      this.socket.write(message);
    }
  }

  writeLine(message: string) {
    this.write(`${message}\r\n`);
  }

  prompt(text: string = '> ') {
    this.write(text);
  }

  disconnect() {
    this.clearIdleTimer();
    if (this.socket.writable) {
      this.socket.end();
    }
    this.state = SessionState.DISCONNECTED;
  }

  private startIdleTimer() {
    this.clearIdleTimer();
    this.idleTimeout = setTimeout(() => {
      this.writeLine('\r\nYou have been idle for too long and will be disconnected.');
      setTimeout(() => {
        this.disconnect();
      }, 5000); // Give 5 seconds to see the message
    }, this.IDLE_TIMEOUT_MS);
  }

  private clearIdleTimer() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = undefined;
    }
  }

  private updateActivity() {
    this.lastActivity = Date.now();
    this.startIdleTimer(); // Reset the idle timer
  }

  getIdleTimeMs(): number {
    return Date.now() - this.lastActivity;
  }

  getIdleTimeMinutes(): number {
    return Math.floor(this.getIdleTimeMs() / 60000);
  }
}