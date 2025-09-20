# Plan

Implement AI-powered NPCs using local Ollama integration with system prompts stored in SQLite. NPCs will provide dynamic, contextual dialogue responses while maintaining character consistency and conversation history.

## Phase 1 - Scaffold
Set up dependencies, type definitions, and basic project structure for Ollama NPC integration.

### Tasks
- [ ] Add ollama dependency (^0.5.0) to package.json
- [ ] [P] Create NPC and OllamaResponse interfaces in src/types/index.ts
- [ ] [P] Create placeholder src/services/ollamaClient.ts with basic structure
- [ ] [P] Create placeholder src/models/npc.ts with basic structure
- [ ] Run npm install
- [ ] Run build to verify TypeScript compilation

### Phase Acceptance Checks
- Build passes
- TypeScript compilation successful
- Dependencies installed correctly

## Phase 2 - Database
Create database schema for NPC prompts and conversation history storage.

### Tasks
- [ ] Add npc_prompts table migration to src/database/db.ts (with system_prompt, personality_traits, conversation_context, model_name, temperature, max_tokens)
- [ ] Add npc_conversations table migration to src/database/db.ts (with npc_name, player_username, player_message, npc_response, timestamp)
- [ ] Update database initialization to run new migrations
- [ ] Test database migrations with npm run seed
- [ ] Verify table creation in SQLite database

### Phase Acceptance Checks
- Database migrations execute successfully
- Tables created with correct schema
- Foreign key constraints working
- Seed command runs without errors

## Phase 3 - Core Services
Implement Ollama client service and NPC model with AI integration capabilities.

### Tasks
- [ ] [P] Implement Ollama client service in src/services/ollamaClient.ts (HTTP client to localhost:11434, 10s timeout, error handling)
- [ ] [P] Implement NPC model in src/models/npc.ts (database CRUD, prompt management, conversation history)
- [ ] Add conversation context management (last 5-10 turns)
- [ ] Implement system prompt formatting with markdown templates
- [ ] Add fallback response handling for Ollama service failures
- [ ] Test Ollama connection and response parsing

### Phase Acceptance Checks
- Ollama client connects to localhost:11434
- NPC model can save/load prompts and conversation history
- Error handling works when Ollama service unavailable
- System prompts format correctly

## Phase 4 - Commands
Create NPC interaction commands and integrate with command dispatcher.

### Tasks
- [ ] Create src/commands/npcCommands.ts with talk/speak commands (follow src/commands/chatCommands.ts pattern)
- [ ] Implement input sanitization and prompt injection prevention
- [ ] Add command parsing for "talk <npc_name> <message>" format
- [ ] Register NPC commands in src/commands/commandDispatcher.ts
- [ ] Test command registration and basic parsing
- [ ] Implement response timeout handling (fallback to scripted responses)

### Phase Acceptance Checks
- NPC commands register successfully
- Command parsing works correctly
- Input sanitization prevents prompt injection
- Timeout handling provides fallback responses

## Phase 5 - Integration
Wire NPC system with existing session management and broadcasting infrastructure.

### Tasks
- [ ] Extend src/server/sessionManager.ts broadcastToRoom for NPC responses
- [ ] Add NPC response handling to src/server/server.ts
- [ ] Initialize Ollama service in server startup
- [ ] Integrate NPC interactions with room presence system
- [ ] Add NPC visibility in room descriptions
- [ ] Test complete interaction flow: player message → AI processing → room broadcast

### Phase Acceptance Checks
- NPCs visible in room descriptions
- AI responses broadcast to correct rooms
- Session management handles NPC interactions
- Server initializes Ollama service correctly

## Phase 6 - Testing
Implement comprehensive test coverage for all NPC components.

### Tasks
- [ ] [P] Create src/tests/ollamaClient.test.ts (API connection, response parsing, error handling with mocked responses)
- [ ] [P] Create src/tests/npcAI.test.ts (database CRUD, prompt management, conversation history)
- [ ] [P] Create src/tests/npcAICommands.test.ts (command processing, input sanitization, fallback behavior)
- [ ] [P] Create integration tests for complete AI response flow
- [ ] Set up HTTP mocking for Ollama API in tests
- [ ] Use in-memory SQLite databases for isolated testing
- [ ] Add performance tests for response times
- [ ] Test multi-turn conversation context preservation

### Phase Acceptance Checks
- All unit tests pass
- Integration tests verify complete flows
- Mocking strategy works for offline testing
- Performance tests show acceptable response times
- Test coverage meets project standards

## Phase 7 - Seeding
Populate database with sample NPCs and character prompts for San Antonio theme.

### Tasks
- [ ] Add sample NPC data to src/database/seed.ts
- [ ] Create system prompts for Historical Tour Guide (The Alamo)
- [ ] Create system prompts for River Walk Boat Captain
- [ ] Create system prompts for Mission Priest (Mission San Jose)
- [ ] Create system prompts for Market Vendor (The Pearl)
- [ ] Create system prompts for Observatory Scientist (Tower of the Americas)
- [ ] Create system prompts for Local Musician (Southtown)
- [ ] Test seeded NPCs with actual Ollama interactions
- [ ] Verify character consistency across conversations

### Phase Acceptance Checks
- Sample NPCs seed successfully
- System prompts produce character-appropriate responses
- NPCs maintain personality consistency
- San Antonio theme integration works correctly
- All seeded NPCs functional with Ollama

## Testing Strategy

### Test Layers
- **Unit Tests**: Focus on individual components (Ollama client, NPC model, commands) with mocked dependencies
- **Integration Tests**: Test complete flows from player input to AI response broadcasting
- **Mocking**: Mock Ollama HTTP API for predictable test scenarios and offline testing

### Frameworks
- **Vitest**: Continue using existing test framework for all AI integration tests
- **better-sqlite3**: Use `:memory:` databases for isolated prompt storage testing
- **HTTP Mocking**: Mock Ollama HTTP API calls for offline testing scenarios

### Critical Test Scenarios
- AI response generation and room broadcasting
- Conversation context preservation across multiple turns
- Graceful degradation when Ollama service unavailable
- Input sanitization and prompt injection prevention
- Performance with multiple simultaneous NPC conversations