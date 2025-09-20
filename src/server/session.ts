import { Socket } from 'net';
import { EventEmitter } from 'events';
import { sessionLogger } from '../utils/logger';
import { Room } from '../models/room';

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
  private authTimeout?: NodeJS.Timeout;
  private readonly IDLE_TIMEOUT_MS: number = 30 * 60 * 1000; // 30 minutes
  private readonly AUTH_TIMEOUT_MS: number = 5 * 60 * 1000; // 5 minutes
  private roomModel: Room;

  constructor(socket: Socket) {
    super();
    this.id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.socket = socket;
    this.state = SessionState.CONNECTED;
    this.lastActivity = Date.now();
    this.roomModel = new Room();

    sessionLogger.info({
      sessionId: this.id,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      state: this.state
    }, `Session created: ${this.id}`);

    this.setupSocketHandlers();
    this.startIdleTimer();
  }

  private setupSocketHandlers() {
    this.socket.on('data', (data: Buffer) => {
      sessionLogger.debug({
        sessionId: this.id,
        username: this.username,
        dataLength: data.length
      }, `Received data: ${data.length} bytes`);

      this.updateActivity();
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.socket.on('end', () => {
      sessionLogger.info({
        sessionId: this.id,
        username: this.username,
        userId: this.userId,
        roomId: this.roomId,
        state: this.state
      }, `Socket ended for session: ${this.id}`);

      this.setState(SessionState.DISCONNECTED);
      this.emit('disconnect');
    });

    this.socket.on('error', (err) => {
      sessionLogger.error({
        sessionId: this.id,
        username: this.username,
        userId: this.userId,
        roomId: this.roomId,
        error: err.message,
        stack: err.stack
      }, `Session socket error: ${this.id}`);

      this.setState(SessionState.DISCONNECTED);
      this.emit('disconnect');
    });
  }

  private processBuffer() {
    let newlineIndex;
    while ((newlineIndex = this.buffer.search(/\r?\n/)) !== -1) {
      const line = this.buffer.substring(0, newlineIndex).trim();
      this.buffer = this.buffer.substring(newlineIndex + 1);

      if (line.length > 0) {
        sessionLogger.debug({
          sessionId: this.id,
          username: this.username,
          userId: this.userId,
          roomId: this.roomId,
          lineLength: line.length,
          line: line.length > 100 ? line.substring(0, 100) + '...' : line
        }, `Processing line from session: ${this.id}`);

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

  // Enhanced Claude Code-style prompt with status line
  async claudePrompt() {
    if (this.state === SessionState.AUTHENTICATED && this.username && this.roomId !== undefined) {
      await this.showStatusLine();
    }
    this.write('\n> ');
  }

  private async showStatusLine() {
    // Create a Claude Code-inspired status line
    const statusLine = await this.buildStatusLine();
    this.writeLine('\n───────────────────────────────────────────────────────────────────────');
    this.writeLine(`\x1b[42m\x1b[30m ${statusLine} \x1b[0m`); // Green background, black text
    this.writeLine('───────────────────────────────────────────────────────────────────────');
  }

  private async buildStatusLine(): Promise<string> {
    const parts = [];

    if (this.username) {
      parts.push(`👤 ${this.username}`);
    }

    if (this.roomId !== undefined) {
      try {
        const room = await this.roomModel.findById(this.roomId);
        const roomName = room ? room.name : `Room ${this.roomId}`;
        parts.push(`📍 ${roomName}`);
      } catch (error) {
        parts.push(`📍 Room ${this.roomId}`);
      }
    }

    // Add online status indicator
    parts.push('🟢 Online');

    // Add current time
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    parts.push(`🕐 ${timeStr}`);

    return parts.join(' | ');
  }

  disconnect() {
    sessionLogger.info({
      sessionId: this.id,
      username: this.username,
      userId: this.userId,
      roomId: this.roomId,
      previousState: this.state,
      idleTime: this.getIdleTimeMinutes()
    }, `Session disconnecting: ${this.id}`);

    this.clearIdleTimer();
    this.clearAuthTimeout();
    if (this.socket.writable) {
      this.socket.end();
    }
    this.setState(SessionState.DISCONNECTED);
  }

  private startIdleTimer() {
    this.clearIdleTimer();
    this.idleTimeout = setTimeout(() => {
      sessionLogger.warn({
        sessionId: this.id,
        username: this.username,
        userId: this.userId,
        roomId: this.roomId,
        idleTimeMinutes: this.getIdleTimeMinutes(),
        timeoutMs: this.IDLE_TIMEOUT_MS
      }, `Session idle timeout warning: ${this.id}`);

      this.writeLine('\r\nYou have been idle for too long and will be disconnected.');
      setTimeout(() => {
        sessionLogger.info({
          sessionId: this.id,
          username: this.username,
          userId: this.userId,
          roomId: this.roomId,
          reason: 'idle_timeout'
        }, `Session disconnected due to idle timeout: ${this.id}`);

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

  getLastActivity(): number {
    return this.lastActivity;
  }

  getIdleTimeMinutes(): number {
    return Math.floor(this.getIdleTimeMs() / 60000);
  }

  setState(newState: SessionState) {
    const oldState = this.state;
    this.state = newState;

    sessionLogger.info({
      sessionId: this.id,
      username: this.username,
      userId: this.userId,
      roomId: this.roomId,
      oldState,
      newState
    }, `Session state changed: ${this.id} (${oldState} -> ${newState})`);

    // Start auth timeout when entering authenticating state
    if (newState === SessionState.AUTHENTICATING) {
      this.startAuthTimeout();
    } else if (oldState === SessionState.AUTHENTICATING) {
      this.clearAuthTimeout();
    }
  }

  private startAuthTimeout() {
    this.clearAuthTimeout();
    this.authTimeout = setTimeout(() => {
      this.emit('authTimeout');
      this.setState(SessionState.CONNECTED);
    }, this.AUTH_TIMEOUT_MS);
  }

  private clearAuthTimeout() {
    if (this.authTimeout) {
      clearTimeout(this.authTimeout);
      this.authTimeout = undefined;
    }
  }
}