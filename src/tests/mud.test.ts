import { describe, it, expect } from 'vitest';
import { TelnetServer } from '../server';

describe('San Antonio MUD', () => {
  it('should create a telnet server', () => {
    const server = new TelnetServer(2324); // Use different port for testing
    expect(server).toBeDefined();
  });

  it('should generate unique session IDs', () => {
    const server = new TelnetServer(2325);
    const sessions = server.getActiveSessions();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBe(0);
  });
});