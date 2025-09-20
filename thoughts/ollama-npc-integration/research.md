# Problem Statement
Use Ollama and system prompt (markdown formats stored in a table in sqlite) for making NPC characters that can interact on the server. Integrate local Ollama instance with SAMud to create AI-powered NPCs with dynamic, contextual dialogue responses based on system prompts stored in the database.

# Impacted Code Areas
- src/database/db.ts :: Add migration for `npc_prompts` table storing system prompts and character profiles
- src/models/npc.ts :: Create NPC model with Ollama integration and prompt management
- src/services/ollamaClient.ts :: New service for Ollama API communication and response handling
- src/commands/npcCommands.ts :: Create talk/speak command for NPC interactions with AI responses
- src/commands/commandDispatcher.ts :: Register AI NPC interaction commands
- src/server/sessionManager.ts :: Extend broadcasting for AI NPC responses in rooms
- src/server/server.ts :: Add Ollama service initialization and NPC response handling
- package.json :: Add ollama dependency for official JavaScript SDK
- src/types/index.ts :: Add NPC and OllamaResponse interfaces
- src/database/seed.ts :: Seed NPCs with character prompts and personalities
- src/tests/ :: Create test files for Ollama integration and NPC AI interactions

# Patterns / Examples
- src/commands/chatCommands.ts :: Follow command registration pattern for AI NPC talk commands
- src/server/sessionManager.ts :: Extend broadcastToRoom pattern for AI NPC responses
- src/models/player.ts :: Database interaction patterns for NPC model with prompt storage
- src/utils/autosave.ts :: Timer management patterns for potential NPC conversation cleanup
- src/database/db.ts :: Migration structure for npc_prompts table with JSON system prompt storage
- src/utils/logger.ts :: Logging patterns for AI response tracking and debugging

# Risks / Constraints
- **External Dependency**: Ollama server must be running locally on machine for NPCs to function
- **Response Latency**: AI generation takes 1-5 seconds, may feel slow for real-time MUD interactions
- **Model Resource Usage**: Local LLM inference consumes significant CPU/memory, could impact server performance
- **Prompt Injection**: User input to NPCs needs sanitization to prevent prompt manipulation
- **Context Management**: NPCs need conversation history tracking for coherent multi-turn dialogue
- **Error Handling**: Ollama service failures require graceful degradation to fallback responses
- **Database Size**: Storing conversation history and prompts may increase database growth significantly
- **Model Selection**: Different Ollama models have varying response quality and resource requirements

# FAR Scores
- Factual: 4 (Clear technical integration requirements with established Ollama API patterns)
- Actionable: 4 (Specific implementation steps using existing MUD architecture)
- Reliable: 3 (Depends on external Ollama service stability and local resource availability)
- Relevant: 5 (Significantly enhances NPC interactions and player engagement in MUD)
- **Average:** 4.0

# INVEST Flags
- Too Large: false (Focused on single feature: AI NPC integration)
- Unclear Requirement: false (Requirements are well-defined)
- Risky Area: true (External service dependency and resource usage concerns)

# Testing Strategy

## Unit Tests
- **Ollama Client Tests** (src/tests/ollamaClient.test.ts)
  - API connection and response parsing with mocked Ollama responses
  - Error handling for service unavailable scenarios
  - Prompt formatting and system message construction

- **NPC Model Tests** (src/tests/npcAI.test.ts)
  - Database CRUD operations for NPC prompts and character data
  - System prompt loading and character personality validation
  - Conversation history persistence and retrieval

- **NPC Command Tests** (src/tests/npcAICommands.test.ts)
  - Talk command processing with AI response integration
  - Input sanitization and prompt injection prevention
  - Fallback behavior when Ollama service is unavailable

## Integration Tests
- **AI Response Flow Tests**
  - Complete NPC interaction: player message → Ollama processing → AI response → room broadcast
  - Multi-turn conversation context preservation
  - Character consistency across multiple interactions

- **Service Integration Tests**
  - Ollama service startup and health check integration
  - Graceful degradation when AI service fails
  - Response timeout handling and fallback mechanisms

## Mocking Strategy
- Mock Ollama API responses using Vitest mocks for predictable test scenarios
- Mock network calls to test offline behavior and error conditions
- Use in-memory SQLite databases for NPC prompt and conversation history testing
- Mock session broadcasting for isolated AI response testing

## Testing Tools
- **Vitest**: Continue using existing test framework for all AI integration tests
- **better-sqlite3**: Use `:memory:` databases for isolated prompt storage testing
- **HTTP Mocking**: Mock Ollama HTTP API calls for offline testing scenarios
- **Performance Testing**: Monitor response times and resource usage in test scenarios

## End-to-End Scenarios
- **Character Interaction Flow**: Player talks to NPC → System prompt loaded → Ollama generates contextual response → Response broadcast to room
- **Conversation Context**: Multi-turn dialogue maintains character personality and conversation history
- **Service Failure Recovery**: Ollama unavailable → NPC provides fallback scripted response
- **Resource Management**: Multiple simultaneous NPC conversations handled without performance degradation

## Database Schema Design

### NPC Prompts Table
```sql
CREATE TABLE npc_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  npc_name TEXT NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL, -- Markdown-formatted character description and behavior
  personality_traits TEXT, -- JSON array of character traits
  conversation_context TEXT, -- JSON object for maintaining conversation state
  model_name TEXT DEFAULT 'llama3.1', -- Ollama model to use for this NPC
  temperature REAL DEFAULT 0.7, -- AI response creativity (0.0-1.0)
  max_tokens INTEGER DEFAULT 150, -- Maximum response length
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Conversation History Table
```sql
CREATE TABLE npc_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  npc_name TEXT NOT NULL,
  player_username TEXT NOT NULL,
  player_message TEXT NOT NULL,
  npc_response TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (npc_name) REFERENCES npc_prompts(npc_name)
);
```

## Implementation Requirements

### Dependencies
```json
{
  "dependencies": {
    "ollama": "^0.5.0"
  }
}
```

### Ollama Service Integration
- **Default Model**: llama3.1 (good balance of quality and performance)
- **Connection**: HTTP client to localhost:11434 (default Ollama port)
- **Timeout**: 10-second timeout for AI responses with fallback to scripted dialogue
- **Context Window**: Maintain last 5-10 conversation turns for coherent dialogue

### Character System Prompt Format
```markdown
# Character: [NPC Name]
## Role
You are [role] in the San Antonio MUD game.

## Personality
- [trait 1]
- [trait 2]
- [trait 3]

## Background
[Character backstory and motivation]

## Speech Patterns
[How the character talks and responds]

## Knowledge
[What the character knows about the game world]

## Restrictions
- Keep responses under 150 words
- Stay in character at all times
- Reference San Antonio landmarks when appropriate
- Use MUD-appropriate language (no modern references)
```

### Sample NPC Characters for San Antonio Theme
1. **Historical Tour Guide** at The Alamo
2. **River Walk Boat Captain** at River Walk
3. **Mission Priest** at Mission San Jose
4. **Market Vendor** at The Pearl
5. **Observatory Scientist** at Tower of the Americas
6. **Local Musician** in Southtown