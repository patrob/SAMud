# Problem Statement
Implement stretch goals for SAMud including NPCs (Non-Player Characters) with keyword-based dialogue, a tick system for automated NPC movement and actions, and additional player commands (emote, whisper, get/drop items).

# Impacted Code Areas
- src/types/index.ts :: Add NPC and Item interfaces
- src/models/ :: Create NPC and Item model classes for database operations
- src/database/db.ts :: Add migrations for npcs and items tables
- src/database/seed.ts :: Add NPC spawning to room seeding
- src/commands/commandDispatcher.ts :: Register new NPC interaction commands (talk, whisper, get, drop)
- src/commands/chatCommands.ts :: Extend with whisper command functionality
- src/commands/worldCommands.ts :: Add get/drop item interaction commands
- src/commands/ :: Create new npcCommands.ts for talk command
- src/server/sessionManager.ts :: Add whisper message routing methods
- src/server/server.ts :: Integrate tick system timer and NPC action broadcasting
- src/server/session.ts :: Support private messaging for whisper command
- src/tests/ :: Create test files for NPC interactions, item management, and tick system

# Patterns / Examples
- src/commands/chatCommands.ts :: Mirror command registration pattern for talk, whisper commands
- src/commands/worldCommands.ts :: Follow existing look/move patterns for get/drop item commands
- src/server/sessionManager.ts :: Extend broadcastToRoom pattern for NPC action announcements
- src/models/player.ts :: Database interaction patterns for NPC and Item models
- src/database/db.ts :: Migration structure for npcs and items table creation
- src/database/seed.ts :: Room creation patterns for NPC spawning

# Risks / Constraints
- Timer management complexity: Tick system requires careful interval cleanup on server shutdown
- Database performance: Frequent NPC movement updates could impact SQLite performance
- Memory usage: Tracking NPC state and item locations in memory alongside existing session data
- Command namespace conflicts: New commands (talk, get, drop) need clear disambiguation
- NPC dialogue scripting: Simple keyword matching may be too basic for engaging interactions
- Broadcasting overhead: NPC actions broadcast to rooms may increase network traffic
- State synchronization: NPCs moving between rooms requires coordination with player sessions

# FAR Scores
- Factual: 4 (Clear technical requirements, well-defined scope)
- Actionable: 4 (Specific commands and features to implement)
- Reliable: 3 (Implementation patterns exist but complexity is significant)
- Relevant: 5 (Directly enhances core MUD gameplay experience)
- **Average:** 4.0

# INVEST Flags
- Too Large: true (Multiple distinct features that could be split into separate tickets)
- Unclear Requirement: false (Requirements are well-specified)
- Risky Area: true (Timer systems and state management add complexity)

# Testing Strategy

## Unit Tests
- **NPC Model Tests** (src/tests/npc.test.ts)
  - CRUD operations for NPC data
  - Keyword matching for dialogue responses
  - Room assignment and movement validation

- **Item Model Tests** (src/tests/item.test.ts)
  - Item creation, pickup, and drop operations
  - Room and player inventory management
  - Item state persistence

- **Command Tests** (src/tests/npcCommands.test.ts, src/tests/itemCommands.test.ts)
  - Talk command with various keyword scenarios
  - Whisper command routing and validation
  - Get/drop command item transfer logic

## Integration Tests
- **Tick System Tests**
  - NPC movement between rooms during tick cycles
  - Broadcasting of NPC actions to room occupants
  - Timer cleanup on server shutdown

- **Session Communication Tests**
  - Whisper message delivery between specific players
  - NPC interaction message broadcasting
  - Room-based announcements for NPC actions

## Mocking Strategy
- Mock `setTimeout`/`setInterval` for tick system testing using Vitest's `vi.useFakeTimers()`
- Mock database operations for NPC and Item models using in-memory SQLite
- Mock session broadcasting for isolated command testing

## Testing Tools
- **Vitest**: Continue using existing test framework
- **better-sqlite3**: Use `:memory:` databases for test isolation
- **Vitest Timer Mocking**: For testing tick system behavior without real delays

## End-to-End Scenarios
- Complete NPC interaction flow: player talks to NPC, receives scripted response
- Item lifecycle: spawn item in room → player picks up → player drops in different room
- Tick-based NPC movement: NPC moves between rooms, announces movement to players
- Whisper communication: private message delivery without room broadcast