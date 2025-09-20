import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandDispatcher } from '../commands/commandDispatcher';
import { Session } from '../server/session';
import { Socket } from 'net';

// Mock session for testing
function createMockSession(): Session {
  const mockSocket = {
    writable: true,
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  } as unknown as Socket;

  const session = new Session(mockSocket);
  session.writeLine = vi.fn();
  return session;
}

describe('CommandDispatcher', () => {
  let dispatcher: CommandDispatcher;
  let mockSession: Session;

  beforeEach(() => {
    dispatcher = new CommandDispatcher();
    mockSession = createMockSession();
  });

  it('should normalize whitespace in commands', async () => {
    const testHandler = vi.fn();
    dispatcher.registerCommand('test', testHandler);

    await dispatcher.dispatch(mockSession, '  test   arg1    arg2  ');

    expect(testHandler).toHaveBeenCalledWith(mockSession, ['arg1', 'arg2']);
  });

  it('should ignore empty input', async () => {
    const testHandler = vi.fn();
    dispatcher.registerCommand('test', testHandler);

    await dispatcher.dispatch(mockSession, '');
    await dispatcher.dispatch(mockSession, '   ');
    await dispatcher.dispatch(mockSession, '\n\r\t');

    expect(testHandler).not.toHaveBeenCalled();
  });

  it('should handle unknown commands gracefully', async () => {
    await dispatcher.dispatch(mockSession, 'unknowncommand');

    expect(mockSession.writeLine).toHaveBeenCalledWith(
      "Unknown command: 'unknowncommand'. Type 'help' for a list of available commands."
    );
  });

  it('should register and handle aliases', async () => {
    const testHandler = vi.fn();
    dispatcher.registerCommand('test', testHandler);
    dispatcher.registerAlias('t', 'test');

    await dispatcher.dispatch(mockSession, 't arg1');

    expect(testHandler).toHaveBeenCalledWith(mockSession, ['arg1']);
  });

  it('should handle command errors gracefully', async () => {
    const errorHandler = vi.fn().mockRejectedValue(new Error('Test error'));
    dispatcher.registerCommand('error', errorHandler);

    await dispatcher.dispatch(mockSession, 'error');

    expect(mockSession.writeLine).toHaveBeenCalledWith(
      'An error occurred while executing the command.'
    );
  });

  it('should return list of commands', () => {
    dispatcher.registerCommand('test1', vi.fn());
    dispatcher.registerCommand('test2', vi.fn());

    const commands = dispatcher.getCommandList();

    expect(commands).toContain('test1');
    expect(commands).toContain('test2');
    expect(commands).toHaveLength(2);
  });
});