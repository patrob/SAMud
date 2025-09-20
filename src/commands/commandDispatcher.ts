import { Session } from '../server/session';
import { commandLogger } from '../utils/logger';

export type CommandHandler = (session: Session, args: string[]) => void | Promise<void>;

export class CommandDispatcher {
  private commands: Map<string, CommandHandler> = new Map();
  private aliases: Map<string, string> = new Map();

  registerCommand(name: string, handler: CommandHandler) {
    this.commands.set(name.toLowerCase(), handler);
    commandLogger.debug(`Registered command: ${name.toLowerCase()}`);
  }

  registerAlias(alias: string, commandName: string) {
    this.aliases.set(alias.toLowerCase(), commandName.toLowerCase());
    commandLogger.debug(`Registered alias: ${alias.toLowerCase()} -> ${commandName.toLowerCase()}`);
  }

  async dispatch(session: Session, input: string) {
    // Normalize whitespace and trim
    const normalizedInput = input.replace(/\s+/g, ' ').trim();

    // Ignore empty lines
    if (!normalizedInput) {
      return;
    }

    const parts = normalizedInput.split(' ');
    if (parts.length === 0 || parts[0] === '') {
      return;
    }

    let commandName = parts[0].toLowerCase();
    const args = parts.slice(1);
    const originalCommand = commandName;

    // Check if it's an alias
    if (this.aliases.has(commandName)) {
      const resolvedCommand = this.aliases.get(commandName)!;
      commandLogger.debug({
        sessionId: session.id,
        username: session.username,
        userId: session.userId,
        roomId: session.roomId,
        originalCommand,
        resolvedCommand,
        args
      }, `Command alias resolved: ${originalCommand} -> ${resolvedCommand}`);
      commandName = resolvedCommand;
    }

    const handler = this.commands.get(commandName);

    if (handler) {
      const startTime = Date.now();

      commandLogger.info({
        sessionId: session.id,
        username: session.username,
        userId: session.userId,
        roomId: session.roomId,
        command: commandName,
        originalCommand: originalCommand !== commandName ? originalCommand : undefined,
        args,
        input: normalizedInput
      }, `Executing command: ${commandName}`);

      try {
        await handler(session, args);
        const duration = Date.now() - startTime;

        commandLogger.info({
          sessionId: session.id,
          username: session.username,
          userId: session.userId,
          roomId: session.roomId,
          command: commandName,
          duration,
          success: true
        }, `Command completed: ${commandName} (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - startTime;

        commandLogger.error({
          sessionId: session.id,
          username: session.username,
          userId: session.userId,
          roomId: session.roomId,
          command: commandName,
          args,
          duration,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }, `Command failed: ${commandName}`);

        session.writeLine('An error occurred while executing the command.');
      }
    } else {
      commandLogger.warn({
        sessionId: session.id,
        username: session.username,
        userId: session.userId,
        roomId: session.roomId,
        command: commandName,
        input: normalizedInput
      }, `Unknown command attempted: ${commandName}`);

      session.writeLine(`Unknown command: '${commandName}'. Type 'help' for a list of available commands.`);
    }
  }

  getCommandList(): string[] {
    return Array.from(this.commands.keys());
  }
}