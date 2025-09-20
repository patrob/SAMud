import { Session } from '../server/session';

export type CommandHandler = (session: Session, args: string[]) => void | Promise<void>;

export class CommandDispatcher {
  private commands: Map<string, CommandHandler> = new Map();
  private aliases: Map<string, string> = new Map();

  registerCommand(name: string, handler: CommandHandler) {
    this.commands.set(name.toLowerCase(), handler);
  }

  registerAlias(alias: string, commandName: string) {
    this.aliases.set(alias.toLowerCase(), commandName.toLowerCase());
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

    // Check if it's an alias
    if (this.aliases.has(commandName)) {
      commandName = this.aliases.get(commandName)!;
    }

    const handler = this.commands.get(commandName);

    if (handler) {
      try {
        await handler(session, args);
      } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        session.writeLine('An error occurred while executing the command.');
      }
    } else {
      session.writeLine(`Unknown command: '${commandName}'. Type 'help' for a list of available commands.`);
    }
  }

  getCommandList(): string[] {
    return Array.from(this.commands.keys());
  }
}