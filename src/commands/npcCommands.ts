import { Session, SessionState } from '../server/session';
import { CommandDispatcher } from './commandDispatcher';
import { NPCModel } from '../models/npc';
import { OllamaClient } from '../services/ollamaClient';
import { chatLogger } from '../utils/logger';

export function registerNPCCommands(dispatcher: CommandDispatcher, sessionManager: any) {
  const npcModel = new NPCModel();
  const ollamaClient = new OllamaClient();

  /**
   * Sanitize user input to prevent prompt injection attacks
   */
  function sanitizeInput(input: string): string {
    // Remove or escape potentially dangerous sequences
    return input
      .replace(/\n\s*System:|Assistant:|User:/gi, '') // Remove role indicators
      .replace(/\n\s*```/g, '') // Remove code blocks
      .replace(/\n\s*#/g, '') // Remove markdown headers
      .trim()
      .slice(0, 500); // Limit length
  }

  /**
   * Talk command - interact with NPCs using AI
   */
  dispatcher.registerCommand('talk', async (session: Session, args: string[]) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to talk to NPCs.');
      return;
    }

    if (!session.roomId || !session.username) {
      session.writeLine('You are not in any room.');
      return;
    }

    if (args.length < 2) {
      session.writeLine('Talk to whom about what?');
      session.writeLine('Usage: talk <npc_name> <message>');
      return;
    }

    const npcName = args[0].toLowerCase();
    const playerMessage = sanitizeInput(args.slice(1).join(' '));

    if (!playerMessage) {
      session.writeLine('Say what?');
      return;
    }

    try {
      // Find the NPC in the current room
      const npc = await npcModel.findByName(npcName);

      if (!npc) {
        session.writeLine(`There is no NPC named '${npcName}' here.`);
        return;
      }

      if (npc.room_id !== session.roomId) {
        session.writeLine(`${npcName} is not in this room.`);
        return;
      }

      chatLogger.info({
        sessionId: session.id,
        username: session.username,
        userId: session.userId,
        roomId: session.roomId,
        npcName: npc.name,
        messageLength: playerMessage.length,
        type: 'npc_interaction'
      }, `NPC interaction: ${session.username} talking to ${npc.name}`);

      // Show player's message to the room
      session.writeLine(`You say to ${npc.name}: ${playerMessage}`);
      sessionManager.broadcastToRoom(
        session.roomId,
        `${session.username} says to ${npc.name}: ${playerMessage}`,
        session.id
      );

      let npcResponse: string;

      try {
        // Check if Ollama is available
        const isOllamaAvailable = await ollamaClient.healthCheck();

        if (!isOllamaAvailable) {
          throw new Error('Ollama service unavailable');
        }

        // Get conversation context
        const conversationContext = await npcModel.getFormattedContext(npc.name, session.username);

        // Format the system prompt
        const systemPrompt = npcModel.formatSystemPrompt(npc, conversationContext);

        // Prepare messages for Ollama
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: playerMessage }
        ];

        // Call Ollama API
        const response = await ollamaClient.chat(
          npc.model_name,
          messages,
          npc.temperature,
          npc.max_tokens
        );

        npcResponse = response.message.content.trim();

        // Save the conversation to history
        await npcModel.saveConversation(npc.name, session.username, playerMessage, npcResponse);

      } catch (error) {
        // Fallback to scripted response if Ollama fails
        console.error(`Ollama error for NPC ${npc.name}:`, error);
        npcResponse = ollamaClient.generateFallbackResponse(npc.name);

        chatLogger.warn({
          sessionId: session.id,
          username: session.username,
          npcName: npc.name,
          error: error instanceof Error ? error.message : 'Unknown error',
          type: 'npc_ollama_fallback'
        }, `Ollama fallback for ${npc.name}`);
      }

      // Send NPC response to the room
      sessionManager.broadcastToRoom(
        session.roomId,
        `${npc.name} says: ${npcResponse}`,
        null // Send to everyone in the room
      );

    } catch (error) {
      console.error('Error in talk command:', error);
      session.writeLine('Something went wrong while talking to the NPC.');

      chatLogger.error({
        sessionId: session.id,
        username: session.username,
        npcName,
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'npc_command_error'
      }, 'Error in NPC talk command');
    }
  });

  /**
   * Speak command - alias for talk
   */
  dispatcher.registerAlias('speak', 'talk');

  /**
   * NPCs command - list NPCs in current room
   */
  dispatcher.registerCommand('npcs', async (session: Session) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to see NPCs.');
      return;
    }

    if (!session.roomId) {
      session.writeLine('You are not in any room.');
      return;
    }

    try {
      const npcs = await npcModel.findByRoomId(session.roomId);

      if (npcs.length === 0) {
        session.writeLine('There are no NPCs in this room.');
        return;
      }

      session.writeLine('\r\n=== NPCs in this room ===');
      for (const npc of npcs) {
        session.writeLine(`${npc.name} - ${npc.personality_traits}`);
      }
      session.writeLine(`\r\nUse 'talk <npc_name> <message>' to interact with them.\r\n`);

    } catch (error) {
      console.error('Error listing NPCs:', error);
      session.writeLine('Error retrieving NPCs in this room.');
    }
  });

  /**
   * Debug command to test Ollama connection (admin only)
   */
  dispatcher.registerCommand('ollama-test', async (session: Session) => {
    if (session.state !== SessionState.AUTHENTICATED) {
      session.writeLine('You must be logged in to test Ollama.');
      return;
    }

    // Simple admin check (you might want a proper admin system)
    if (session.username !== 'admin') {
      session.writeLine('This command is for administrators only.');
      return;
    }

    try {
      const isAvailable = await ollamaClient.healthCheck();
      if (isAvailable) {
        session.writeLine('✅ Ollama service is available');

        const models = await ollamaClient.listModels();
        session.writeLine(`Available models: ${models.join(', ')}`);
      } else {
        session.writeLine('❌ Ollama service is not available');
      }
    } catch (error) {
      session.writeLine(`❌ Ollama test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });
}