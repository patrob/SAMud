import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NPCModel, NPCData, ConversationData } from '../models/npc';
import { MudDatabase } from '../database/db';
import fs from 'fs';

describe('NPC AI Model', () => {
  let npcModel: NPCModel;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = './test-npc.db';

    // Reset database instance
    MudDatabase.reset();

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize with test database
    MudDatabase.getInstance(testDbPath);
    npcModel = new NPCModel();
  });

  afterEach(() => {
    // Reset database instance and clean up test database
    MudDatabase.reset();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('NPC CRUD Operations', () => {
    it('should create a new NPC', async () => {
      const npcData = {
        name: 'Alamo Guide',
        room_id: 1,
        system_prompt: 'You are a knowledgeable guide at the Alamo.',
        personality_traits: 'Friendly, historical, educational',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      const npcId = await npcModel.create(npcData);

      expect(npcId).toBeGreaterThan(0);

      const foundNPC = await npcModel.findByName('Alamo Guide');
      expect(foundNPC).toBeTruthy();
      expect(foundNPC?.name).toBe('Alamo Guide');
      expect(foundNPC?.room_id).toBe(1);
      expect(foundNPC?.system_prompt).toBe('You are a knowledgeable guide at the Alamo.');
    });

    it('should not allow duplicate NPC names', async () => {
      const npcData = {
        name: 'Duplicate NPC',
        room_id: 1,
        system_prompt: 'Test NPC',
        personality_traits: 'Test traits',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      await npcModel.create(npcData);

      await expect(npcModel.create(npcData)).rejects.toThrow(
        "NPC with name 'Duplicate NPC' already exists"
      );
    });

    it('should find NPC by name (case insensitive)', async () => {
      const npcData = {
        name: 'TestNPC',
        room_id: 1,
        system_prompt: 'Test prompt',
        personality_traits: 'Test traits',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      await npcModel.create(npcData);

      const foundNPC = await npcModel.findByName('testnpc');
      expect(foundNPC).toBeTruthy();
      expect(foundNPC?.name).toBe('TestNPC');
    });

    it('should find NPCs by room ID', async () => {
      const npc1Data = {
        name: 'NPC1',
        room_id: 1,
        system_prompt: 'Test prompt 1',
        personality_traits: 'Traits 1',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      const npc2Data = {
        name: 'NPC2',
        room_id: 1,
        system_prompt: 'Test prompt 2',
        personality_traits: 'Traits 2',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      const npc3Data = {
        name: 'NPC3',
        room_id: 2,
        system_prompt: 'Test prompt 3',
        personality_traits: 'Traits 3',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      await npcModel.create(npc1Data);
      await npcModel.create(npc2Data);
      await npcModel.create(npc3Data);

      const room1NPCs = await npcModel.findByRoomId(1);
      expect(room1NPCs).toHaveLength(2);
      expect(room1NPCs.map(npc => npc.name)).toContain('NPC1');
      expect(room1NPCs.map(npc => npc.name)).toContain('NPC2');

      const room2NPCs = await npcModel.findByRoomId(2);
      expect(room2NPCs).toHaveLength(1);
      expect(room2NPCs[0].name).toBe('NPC3');
    });

    it('should update conversation context by ID', async () => {
      const npcData = {
        name: 'Context Test NPC',
        room_id: 1,
        system_prompt: 'Test prompt',
        personality_traits: 'Test traits',
        conversation_context: 'Initial context',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      const npcId = await npcModel.create(npcData);
      const newContext = 'Updated conversation context';

      await npcModel.updateConversationContext(npcId, newContext);

      const updatedNPC = await npcModel.findByName('Context Test NPC');
      expect(updatedNPC?.conversation_context).toBe(newContext);
    });

    it('should update conversation context by name', async () => {
      const npcData = {
        name: 'Name Context NPC',
        room_id: 1,
        system_prompt: 'Test prompt',
        personality_traits: 'Test traits',
        conversation_context: 'Initial context',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      await npcModel.create(npcData);
      const newContext = 'Updated context via name';

      await npcModel.updateConversationContextByName('Name Context NPC', newContext);

      const updatedNPC = await npcModel.findByName('Name Context NPC');
      expect(updatedNPC?.conversation_context).toBe(newContext);
    });

    it('should delete NPC by name', async () => {
      const npcData = {
        name: 'Delete Test NPC',
        room_id: 1,
        system_prompt: 'Test prompt',
        personality_traits: 'Test traits',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      await npcModel.create(npcData);

      const deleted = await npcModel.deleteByName('Delete Test NPC');
      expect(deleted).toBe(true);

      const foundNPC = await npcModel.findByName('Delete Test NPC');
      expect(foundNPC).toBeNull();
    });

    it('should list all NPCs', async () => {
      const npc1Data = {
        name: 'List NPC 1',
        room_id: 1,
        system_prompt: 'Test prompt 1',
        personality_traits: 'Traits 1',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      const npc2Data = {
        name: 'List NPC 2',
        room_id: 2,
        system_prompt: 'Test prompt 2',
        personality_traits: 'Traits 2',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      await npcModel.create(npc1Data);
      await npcModel.create(npc2Data);

      const allNPCs = await npcModel.listAll();
      expect(allNPCs).toHaveLength(2);
      expect(allNPCs.map(npc => npc.name)).toContain('List NPC 1');
      expect(allNPCs.map(npc => npc.name)).toContain('List NPC 2');
    });
  });

  describe('Conversation Management', () => {
    beforeEach(async () => {
      // Create a test NPC for conversation tests
      const npcData = {
        name: 'Chat NPC',
        room_id: 1,
        system_prompt: 'You are a friendly chatbot.',
        personality_traits: 'Helpful, conversational',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500
      };

      await npcModel.create(npcData);
    });

    it('should save conversation history', async () => {
      await npcModel.saveConversation(
        'Chat NPC',
        'testuser',
        'Hello there!',
        'Hello! How can I help you today?'
      );

      const conversations = await npcModel.getRecentConversations('Chat NPC', 'testuser', 10);
      expect(conversations).toHaveLength(1);
      expect(conversations[0].player_message).toBe('Hello there!');
      expect(conversations[0].npc_response).toBe('Hello! How can I help you today?');
    });

    it('should retrieve recent conversations in chronological order', async () => {
      // Add multiple conversations
      await npcModel.saveConversation('Chat NPC', 'testuser', 'First message', 'First response');
      await npcModel.saveConversation('Chat NPC', 'testuser', 'Second message', 'Second response');
      await npcModel.saveConversation('Chat NPC', 'testuser', 'Third message', 'Third response');

      const conversations = await npcModel.getRecentConversations('Chat NPC', 'testuser', 10);
      expect(conversations).toHaveLength(3);

      // Should be in chronological order (oldest first)
      expect(conversations[0].player_message).toBe('First message');
      expect(conversations[1].player_message).toBe('Second message');
      expect(conversations[2].player_message).toBe('Third message');
    });

    it('should limit recent conversations to specified count', async () => {
      // Add more conversations than the limit
      for (let i = 1; i <= 10; i++) {
        await npcModel.saveConversation(
          'Chat NPC',
          'testuser',
          `Message ${i}`,
          `Response ${i}`
        );
      }

      const conversations = await npcModel.getRecentConversations('Chat NPC', 'testuser', 5);
      expect(conversations).toHaveLength(5);

      // Should get the 5 most recent (6-10)
      expect(conversations[0].player_message).toBe('Message 6');
      expect(conversations[4].player_message).toBe('Message 10');
    });

    it('should separate conversations by player', async () => {
      await npcModel.saveConversation('Chat NPC', 'user1', 'User1 message', 'Response to user1');
      await npcModel.saveConversation('Chat NPC', 'user2', 'User2 message', 'Response to user2');

      const user1Conversations = await npcModel.getRecentConversations('Chat NPC', 'user1', 10);
      const user2Conversations = await npcModel.getRecentConversations('Chat NPC', 'user2', 10);

      expect(user1Conversations).toHaveLength(1);
      expect(user1Conversations[0].player_message).toBe('User1 message');

      expect(user2Conversations).toHaveLength(1);
      expect(user2Conversations[0].player_message).toBe('User2 message');
    });

    it('should format conversation context for AI prompt', async () => {
      await npcModel.saveConversation('Chat NPC', 'testuser', 'How are you?', 'I am doing well!');
      await npcModel.saveConversation('Chat NPC', 'testuser', 'What can you do?', 'I can chat with you!');

      const formattedContext = await npcModel.getFormattedContext('Chat NPC', 'testuser');

      expect(formattedContext).toContain('Previous conversation history with testuser');
      expect(formattedContext).toContain('testuser: How are you?');
      expect(formattedContext).toContain('Chat NPC: I am doing well!');
      expect(formattedContext).toContain('testuser: What can you do?');
      expect(formattedContext).toContain('Chat NPC: I can chat with you!');
      expect(formattedContext).toContain('Current conversation:');
    });

    it('should handle empty conversation history', async () => {
      const formattedContext = await npcModel.getFormattedContext('Chat NPC', 'newuser');

      expect(formattedContext).toBe('This is your first conversation with newuser.');
    });
  });

  describe('System Prompt Formatting', () => {
    it('should format system prompt with context', () => {
      const npcData: NPCData = {
        id: 1,
        name: 'Test NPC',
        room_id: 1,
        system_prompt: 'You are a helpful assistant in San Antonio.',
        personality_traits: 'Friendly, knowledgeable about local history',
        conversation_context: '',
        model_name: 'llama2',
        temperature: 0.7,
        max_tokens: 500,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const conversationContext = 'Previous conversation: User asked about the Alamo.';
      const formattedPrompt = npcModel.formatSystemPrompt(npcData, conversationContext);

      expect(formattedPrompt).toContain('You are a helpful assistant in San Antonio.');
      expect(formattedPrompt).toContain('**Character Traits:** Friendly, knowledgeable about local history');
      expect(formattedPrompt).toContain('**Conversation Context:**');
      expect(formattedPrompt).toContain('Previous conversation: User asked about the Alamo.');
      expect(formattedPrompt).toContain('Respond as Test NPC would');
      expect(formattedPrompt).toContain('San Antonio setting');
    });
  });
});