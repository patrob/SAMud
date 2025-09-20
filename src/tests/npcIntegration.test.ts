import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandDispatcher } from '../commands/commandDispatcher';
import { registerNPCCommands } from '../commands/npcCommands';
import { Session, SessionState } from '../server/session';
import { MudDatabase } from '../database/db';
import { NPCModel } from '../models/npc';
import { OllamaClient } from '../services/ollamaClient';
import fs from 'fs';

// Mock fetch for Ollama client
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock session manager with room broadcasting
const mockSessionManager = {
  broadcastToRoom: vi.fn(),
  getInRoom: vi.fn(() => []),
  getByUsername: vi.fn(() => null)
};

// Mock session
const createMockSession = (overrides = {}) => ({
  id: 'test-session-id',
  state: SessionState.AUTHENTICATED,
  username: 'testuser',
  userId: 1,
  roomId: 1,
  writeLine: vi.fn(),
  claudePrompt: vi.fn(),
  disconnect: vi.fn(),
  getLastActivity: vi.fn(() => Date.now()),
  on: vi.fn(),
  ...overrides
});

describe('NPC AI Integration Tests', () => {
  let dispatcher: CommandDispatcher;
  let session: any;
  let testDbPath: string;
  let npcModel: NPCModel;

  beforeEach(async () => {
    testDbPath = './test-npc-integration.db';

    // Reset database instance
    MudDatabase.reset();

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize with test database
    MudDatabase.getInstance(testDbPath);

    // Setup test objects
    dispatcher = new CommandDispatcher();
    session = createMockSession();
    npcModel = new NPCModel();

    // Register NPC commands
    registerNPCCommands(dispatcher, mockSessionManager);

    // Clear all mocks
    vi.clearAllMocks();
    mockFetch.mockClear();
    mockSessionManager.broadcastToRoom.mockClear();

    // Create San Antonio themed test NPCs
    await npcModel.create({
      name: 'AlamoGuide',
      room_id: 1,
      system_prompt: 'You are a knowledgeable tour guide at the Alamo in San Antonio. You love sharing the history of this historic site and are passionate about Texas independence.',
      personality_traits: 'Enthusiastic, historical, educational, proud Texan',
      conversation_context: '',
      model_name: 'llama2',
      temperature: 0.7,
      max_tokens: 200
    });

    await npcModel.create({
      name: 'RiverWalkBoatman',
      room_id: 2,
      system_prompt: 'You are a friendly boat captain on the San Antonio River Walk. You give boat tours and know all about the restaurants, shops, and history along the river.',
      personality_traits: 'Friendly, relaxed, knows local spots, chatty',
      conversation_context: '',
      model_name: 'llama2',
      temperature: 0.8,
      max_tokens: 250
    });
  });

  afterEach(() => {
    // Reset database instance and clean up test database
    MudDatabase.reset();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    vi.clearAllMocks();
  });

  describe('Complete AI Response Flow', () => {
    it('should handle complete conversation flow with Ollama', async () => {
      // Mock successful Ollama health check and response
      mockFetch
        .mockResolvedValueOnce({ ok: true }) // Health check
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            message: {
              content: "Welcome to the Alamo! This historic site was where brave Texans made their stand for independence in 1836. Would you like to know more about the battle?"
            }
          })
        });

      const startTime = Date.now();
      await dispatcher.dispatch(session, 'talk AlamoGuide Tell me about the Alamo');
      const responseTime = Date.now() - startTime;

      // Verify player message was displayed
      expect(session.writeLine).toHaveBeenCalledWith('You say to AlamoGuide: Tell me about the Alamo');

      // Verify player message was broadcast to room
      expect(mockSessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'testuser says to AlamoGuide: Tell me about the Alamo',
        'test-session-id'
      );

      // Verify AI response was broadcast to room
      expect(mockSessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        expect.stringContaining('AlamoGuide says: Welcome to the Alamo!'),
        null
      );

      // Verify conversation was saved to database
      const conversations = await npcModel.getRecentConversations('AlamoGuide', 'testuser', 1);
      expect(conversations).toHaveLength(1);
      expect(conversations[0].player_message).toBe('Tell me about the Alamo');
      expect(conversations[0].npc_response).toContain('Welcome to the Alamo!');

      // Performance check - response should be under 1 second in tests
      expect(responseTime).toBeLessThan(1000);
    });

    it('should handle multi-turn conversation with context preservation', async () => {
      // First conversation turn
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            message: { content: "The Alamo was built as a mission in 1718 and later became a fortress." }
          })
        });

      await dispatcher.dispatch(session, 'talk AlamoGuide When was the Alamo built?');

      // Second conversation turn
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            message: { content: "The famous battle occurred in March 1836 during the Texas Revolution." }
          })
        });

      await dispatcher.dispatch(session, 'talk AlamoGuide When was the famous battle?');

      // Verify both conversations were saved
      const conversations = await npcModel.getRecentConversations('AlamoGuide', 'testuser', 10);
      expect(conversations).toHaveLength(2);

      // Verify context formatting includes conversation history
      const formattedContext = await npcModel.getFormattedContext('AlamoGuide', 'testuser');
      expect(formattedContext).toContain('Previous conversation history with testuser');
      expect(formattedContext).toContain('When was the Alamo built?');
      expect(formattedContext).toContain('The Alamo was built as a mission');
    });

    it('should handle fallback gracefully when Ollama is unavailable', async () => {
      // Mock Ollama service unavailable
      mockFetch.mockResolvedValueOnce({ ok: false });

      await dispatcher.dispatch(session, 'talk AlamoGuide Hello there');

      // Should still show player interaction
      expect(session.writeLine).toHaveBeenCalledWith('You say to AlamoGuide: Hello there');
      expect(mockSessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        'testuser says to AlamoGuide: Hello there',
        'test-session-id'
      );

      // Should use fallback response
      expect(mockSessionManager.broadcastToRoom).toHaveBeenCalledWith(
        1,
        expect.stringMatching(/AlamoGuide (seems distracted|is busy|appears to be|nods politely|gives you)/),
        null
      );
    });

    it('should handle multiple NPCs in different rooms', async () => {
      // Move session to room 2
      session.roomId = 2;

      // Mock Ollama response for RiverWalkBoatman
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            message: {
              content: "Welcome aboard! The River Walk is the heart of downtown San Antonio. We'll see beautiful cypress trees and historic architecture."
            }
          })
        });

      await dispatcher.dispatch(session, 'talk RiverWalkBoatman Tell me about the River Walk');

      // Verify interaction with correct NPC
      expect(session.writeLine).toHaveBeenCalledWith('You say to RiverWalkBoatman: Tell me about the River Walk');

      // Verify broadcast to correct room
      expect(mockSessionManager.broadcastToRoom).toHaveBeenCalledWith(
        2,
        'testuser says to RiverWalkBoatman: Tell me about the River Walk',
        'test-session-id'
      );

      // Verify AI response
      expect(mockSessionManager.broadcastToRoom).toHaveBeenCalledWith(
        2,
        expect.stringContaining('RiverWalkBoatman says: Welcome aboard!'),
        null
      );
    });

    it('should handle concurrent conversations with different NPCs', async () => {
      // Create another NPC in the same room
      await npcModel.create({
        name: 'LocalMusician',
        room_id: 1,
        system_prompt: 'You are a local musician playing in San Antonio. You love Tejano music and know about the local music scene.',
        personality_traits: 'Musical, passionate, cultural, friendly',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 200
      });

      // Talk to AlamoGuide
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: { content: "The Alamo represents Texas independence!" } })
        });

      await dispatcher.dispatch(session, 'talk AlamoGuide What does the Alamo represent?');

      // Talk to LocalMusician
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: { content: "Tejano music is the soul of San Antonio!" } })
        });

      await dispatcher.dispatch(session, 'talk LocalMusician Tell me about Tejano music');

      // Verify separate conversation histories
      const alamoConversations = await npcModel.getRecentConversations('AlamoGuide', 'testuser', 10);
      const musicianConversations = await npcModel.getRecentConversations('LocalMusician', 'testuser', 10);

      expect(alamoConversations).toHaveLength(1);
      expect(alamoConversations[0].player_message).toBe('What does the Alamo represent?');

      expect(musicianConversations).toHaveLength(1);
      expect(musicianConversations[0].player_message).toBe('Tell me about Tejano music');
    });
  });

  describe('Performance Tests', () => {
    it('should handle rapid successive conversations', async () => {
      const responses = [];
      const startTime = Date.now();

      // Mock multiple rapid interactions
      for (let i = 0; i < 5; i++) {
        mockFetch
          .mockResolvedValueOnce({ ok: true })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ message: { content: `Response ${i + 1}` } })
          });

        const responseStart = Date.now();
        await dispatcher.dispatch(session, `talk AlamoGuide Question ${i + 1}`);
        responses.push(Date.now() - responseStart);
      }

      const totalTime = Date.now() - startTime;

      // All responses should complete within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 5 interactions

      // Individual responses should be quick
      responses.forEach(responseTime => {
        expect(responseTime).toBeLessThan(1000); // Each response under 1 second
      });

      // Verify all conversations were saved
      const conversations = await npcModel.getRecentConversations('AlamoGuide', 'testuser', 10);
      expect(conversations).toHaveLength(5);
    });

    it('should handle large conversation histories efficiently', async () => {
      // Create a large conversation history
      for (let i = 0; i < 50; i++) {
        await npcModel.saveConversation(
          'AlamoGuide',
          'testuser',
          `Message ${i}`,
          `Response ${i}`
        );
      }

      // Test context formatting performance
      const startTime = Date.now();
      const context = await npcModel.getFormattedContext('AlamoGuide', 'testuser');
      const formatTime = Date.now() - startTime;

      // Context formatting should be fast even with large history
      expect(formatTime).toBeLessThan(100); // Under 100ms

      // Should limit context to recent conversations
      expect(context).toContain('Message 49'); // Most recent
      expect(context).not.toContain('Message 1'); // Oldest should be excluded
    });
  });
});