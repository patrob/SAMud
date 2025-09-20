import { MudDatabase } from '../database/db';
import { NPC } from '../types/index.js';

export interface NPCData {
  id: number;
  name: string;
  room_id: number;
  system_prompt: string;
  personality_traits: string;
  conversation_context: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationData {
  id: number;
  npc_name: string;
  player_username: string;
  player_message: string;
  npc_response: string;
  timestamp: string;
}

export class NPCModel {
  private db: MudDatabase;

  constructor() {
    this.db = MudDatabase.getInstance();
  }

  /**
   * Create a new NPC with system prompt and configuration
   */
  async create(npcData: Omit<NPCData, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const stmt = this.db.getDb().prepare(`
      INSERT INTO npc_prompts (
        name, room_id, system_prompt, personality_traits,
        conversation_context, model_name, temperature, max_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        npcData.name,
        npcData.room_id,
        npcData.system_prompt,
        npcData.personality_traits,
        npcData.conversation_context,
        npcData.model_name,
        npcData.temperature,
        npcData.max_tokens
      );
      return result.lastInsertRowid as number;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error(`NPC with name '${npcData.name}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Find NPC by name
   */
  async findByName(name: string): Promise<NPCData | null> {
    const stmt = this.db.getDb().prepare(
      'SELECT * FROM npc_prompts WHERE name = ? COLLATE NOCASE'
    );

    const npc = stmt.get(name) as NPCData | undefined;
    return npc || null;
  }

  /**
   * Find all NPCs in a specific room
   */
  async findByRoomId(roomId: number): Promise<NPCData[]> {
    const stmt = this.db.getDb().prepare(
      'SELECT * FROM npc_prompts WHERE room_id = ?'
    );

    return stmt.all(roomId) as NPCData[];
  }

  /**
   * Update NPC conversation context
   */
  async updateConversationContext(npcId: number, context: string): Promise<void> {
    const stmt = this.db.getDb().prepare(
      'UPDATE npc_prompts SET conversation_context = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    );

    const result = stmt.run(context, npcId);

    if (result.changes === 0) {
      throw new Error(`NPC with id ${npcId} not found`);
    }
  }

  /**
   * Update NPC conversation context by name
   */
  async updateConversationContextByName(npcName: string, context: string): Promise<void> {
    const stmt = this.db.getDb().prepare(
      'UPDATE npc_prompts SET conversation_context = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?'
    );

    const result = stmt.run(context, npcName);

    if (result.changes === 0) {
      throw new Error(`NPC with name '${npcName}' not found`);
    }
  }

  /**
   * Save conversation turn to history
   */
  async saveConversation(npcName: string, playerUsername: string, playerMessage: string, npcResponse: string): Promise<void> {
    const stmt = this.db.getDb().prepare(`
      INSERT INTO npc_conversations (npc_name, player_username, player_message, npc_response)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(npcName, playerUsername, playerMessage, npcResponse);
  }

  /**
   * Get recent conversation history for context
   */
  async getRecentConversations(npcName: string, playerUsername: string, limit: number = 5): Promise<ConversationData[]> {
    const stmt = this.db.getDb().prepare(`
      SELECT * FROM npc_conversations
      WHERE npc_name = ? AND player_username = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const conversations = stmt.all(npcName, playerUsername, limit) as ConversationData[];
    return conversations.reverse(); // Return in chronological order (oldest first)
  }

  /**
   * Get conversation context formatted for AI prompt
   */
  async getFormattedContext(npcName: string, playerUsername: string): Promise<string> {
    const conversations = await this.getRecentConversations(npcName, playerUsername, 10);

    if (conversations.length === 0) {
      return `This is your first conversation with ${playerUsername}.`;
    }

    const contextLines = conversations.map(conv =>
      `${playerUsername}: ${conv.player_message}\n${npcName}: ${conv.npc_response}`
    );

    return `Previous conversation history with ${playerUsername}:\n\n${contextLines.join('\n\n')}\n\nCurrent conversation:`;
  }

  /**
   * Delete an NPC by name
   */
  async deleteByName(name: string): Promise<boolean> {
    const stmt = this.db.getDb().prepare('DELETE FROM npc_prompts WHERE name = ?');
    const result = stmt.run(name);
    return result.changes > 0;
  }

  /**
   * List all NPCs
   */
  async listAll(): Promise<NPCData[]> {
    const stmt = this.db.getDb().prepare('SELECT * FROM npc_prompts ORDER BY name');
    return stmt.all() as NPCData[];
  }

  /**
   * Format system prompt with context for AI interaction
   */
  formatSystemPrompt(npc: NPCData, conversationContext: string): string {
    return `${npc.system_prompt}

**Character Traits:** ${npc.personality_traits}

**Conversation Context:**
${conversationContext}

Respond as ${npc.name} would, staying true to their personality and the San Antonio setting. Keep responses conversational and engaging, typically 1-3 sentences.`;
  }
}