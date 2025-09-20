# Plan

Implement NPCs with keyword dialogue, tick system for automated actions, and new player commands (emote, whisper, get/drop) while preserving existing SAMud functionality. Use incremental, additive-only approach to minimize risk of breaking current telnet server, chat system, and movement mechanics.

## Phase 1 - Database Foundation

Extend database schema with new tables for NPCs and items without modifying existing structure. Create corresponding model classes following established patterns.

### Tasks
- [ ] [P] Add migration for `npcs` table (id, name, room_id, dialogue_keywords, responses)
- [ ] [P] Add migration for `items` table (id, name, description, room_id, player_id)
- [ ] [P] Create `src/models/npc.ts` following `src/models/player.ts` patterns
- [ ] [P] Create `src/models/item.ts` following `src/models/player.ts` patterns
- [ ] [P] Write unit tests for NPC model in `src/tests/npc.test.ts`
- [ ] [P] Write unit tests for Item model in `src/tests/item.test.ts`
- [ ] Update `src/types/index.ts` with NPC and Item interfaces
- [ ] Run tests, linter, type-check, and build

### Phase Acceptance Checks
- Build passes
- Existing functionality unaffected
- Database migrations apply cleanly

## Phase 2 - Command Scaffold

Create new command files and extend existing ones following established command registration patterns. Register new commands in dispatcher without breaking existing command routing.

### Tasks
- [ ] [P] Create `src/commands/npcCommands.ts` with `talk` command following `src/commands/chatCommands.ts` pattern
- [ ] [P] Create `src/commands/itemCommands.ts` with `get` and `drop` commands following `src/commands/worldCommands.ts` pattern
- [ ] [P] Add `emote` command to `src/commands/chatCommands.ts`
- [ ] [P] Add `whisper` command to `src/commands/chatCommands.ts`
- [ ] [P] Write unit tests for NPC commands in `src/tests/npcCommands.test.ts`
- [ ] [P] Write unit tests for item commands in `src/tests/itemCommands.test.ts`
- [ ] Update `src/commands/commandDispatcher.ts` to register new commands
- [ ] Extend `src/server/session.ts` to support private messaging for whisper
- [ ] Run tests, linter, type-check, and build

### Phase Acceptance Checks
- Build passes
- All existing commands still functional
- New commands registered but may show "not implemented" messages

## Phase 3 - NPC Integration

Implement NPC dialogue system and spawn NPCs in rooms. Add NPC awareness to room descriptions and session management without breaking existing presence system.

### Tasks
- [ ] Implement keyword matching dialogue logic in `src/commands/npcCommands.ts`
- [ ] Update `src/database/seed.ts` to spawn NPCs in rooms following existing room creation patterns
- [ ] [P] Extend `src/server/sessionManager.ts` broadcastToRoom to include NPCs in room descriptions
- [ ] [P] Add NPC listing to room look command in `src/commands/worldCommands.ts`
- [ ] [P] Write integration tests for NPC interactions in `src/tests/npcIntegration.test.ts`
- [ ] Test complete NPC interaction flow (talk command → keyword match → response)
- [ ] Run tests, linter, type-check, and build

### Phase Acceptance Checks
- Build passes
- NPCs appear in room descriptions
- Talk command provides scripted responses

## Phase 4 - Item Integration

Implement item pickup/drop mechanics and spawn items in world. Extend room descriptions to show available items without breaking existing look command functionality.

### Tasks
- [ ] Implement item pickup logic in `src/commands/itemCommands.ts` get command
- [ ] Implement item drop logic in `src/commands/itemCommands.ts` drop command
- [ ] Update `src/database/seed.ts` to spawn items in rooms
- [ ] [P] Add item listing to room look command in `src/commands/worldCommands.ts`
- [ ] [P] Add player inventory display to relevant commands
- [ ] [P] Write integration tests for item lifecycle in `src/tests/itemIntegration.test.ts`
- [ ] Test complete item flow (spawn → pickup → move → drop)
- [ ] Run tests, linter, type-check, and build

### Phase Acceptance Checks
- Build passes
- Items appear in room descriptions
- Get/drop commands transfer items correctly
- Player inventory tracking works

## Phase 5 - Tick System

Implement automated NPC actions and movement through tick-based system. Integrate timer carefully into server lifecycle with proper cleanup to avoid breaking existing server stability.

### Tasks
- [ ] Create `src/server/tickManager.ts` as separate module
- [ ] [P] Implement NPC movement logic between rooms
- [ ] [P] Implement NPC action broadcasting to room occupants
- [ ] [P] Write tick system tests using `vi.useFakeTimers()` in `src/tests/tickSystem.test.ts`
- [ ] Add timer integration to `src/server/server.ts` with graceful startup/shutdown
- [ ] [P] Add timer cleanup on server shutdown
- [ ] [P] Test tick system with mocked timers first
- [ ] Test tick system with real timers and multiple NPCs
- [ ] Run tests, linter, type-check, and build

### Phase Acceptance Checks
- Build passes
- NPCs move between rooms automatically
- NPC actions broadcast to players
- Server shuts down cleanly without timer leaks
- Existing server functionality unaffected