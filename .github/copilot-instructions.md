# GitHub Copilot Instructions for SAMud

## Project Overview
SAMud is a San Antonio-themed text-based Multi-User Dungeon (MUD) that runs as a TCP server on port 2323. Players connect via telnet to explore landmarks, chat, and interact in real-time.

## Architecture Patterns

### Command System Architecture
- **Central Pattern**: All commands are registered with `CommandDispatcher` in `src/server/server.ts#setupCommands()`
- **Command Structure**: Each command module exports a `register*Commands(dispatcher, sessionManager)` function
- **Authentication Flow**: Special `__auth_flow__` command handles multi-step signup/login without exposing it to users
- **Command Registration**: Use `dispatcher.registerCommand(name, handler)` and `dispatcher.registerAlias(alias, commandName)`

### Session Management Pattern
- **Session Lifecycle**: CONNECTED → AUTHENTICATING → AUTHENTICATED → DISCONNECTED
- **State Tracking**: Sessions store `userId`, `username`, `roomId` for navigation and presence
- **Idle Management**: 30-minute timeout with activity tracking via `updateActivity()`
- **Buffer Processing**: Handles telnet protocol with CRLF line endings in `processBuffer()`

### Database Patterns
- **Singleton Pattern**: `MudDatabase.getInstance()` ensures single connection across the app
- **Migration System**: Built-in migration tracking with automatic execution
- **Seeding**: `seedSync()` auto-runs if rooms table is empty
- **Models**: Each model class takes database instance in constructor, implements CRUD operations

### Testing Conventions
- **Mock Sessions**: Use `createMockSession()` helper in tests that provides stubbed Socket and writeLine
- **Database Testing**: Each test should use isolated database file (see existing test patterns)
- **Command Testing**: Test via `dispatcher.dispatch(mockSession, inputString)` rather than calling handlers directly

## Key Development Workflows

### Development Commands
```bash
npm run dev         # ts-node with hot reload
npm run test        # Vitest with file watching
npm run seed        # Populate database with San Antonio locations
npm run build       # TypeScript compilation
```

### Testing Strategy
- **Unit Tests**: Focus on command parsing, model operations, room navigation
- **Mocking**: Use Vitest `vi.fn()` for socket operations and database calls
- **Test Files**: Place in `src/tests/` matching the pattern `*.test.ts`

### Database Operations
- **Environment**: Use `DB_PATH` env var to set database location (defaults to `./mud.db`)
- **Schema**: Core tables are `users`, `players`, `rooms`, `exits` with foreign key constraints
- **Persistence**: Player locations auto-save every 60 seconds via `AutosaveManager`

## Project-Specific Conventions

### Session Communication
- **Output**: Always use `session.writeLine(message)` for player feedback
- **Input Handling**: Commands receive parsed `args: string[]` array
- **Error Handling**: Wrap command handlers in try/catch, show user-friendly error messages

### Room and Movement System
- **Navigation**: Rooms connected via `exits` table with `direction` and `destination_room_id`
- **Presence**: `SessionManager.roomPresence` tracks which players are in each room
- **Location Updates**: Update both `session.roomId` and database `players.current_room_id`

### Authentication Flow
- **State Management**: Use `signupFlows` and `loginFlows` Maps to track multi-step auth
- **Password Security**: Hash with bcrypt before storing, never log passwords
- **Session Transition**: Set `session.state = SessionState.AUTHENTICATED` after successful auth

### San Antonio Theme Integration
- **Locations**: Seed script creates iconic SA locations (Alamo, River Walk, Pearl, etc.)
- **Starting Location**: New players begin at "The Alamo Plaza" (room_id 1)
- **Naming**: Use authentic San Antonio landmark names and descriptions

## Critical Integration Points

### Server Startup Sequence
1. Initialize `MudDatabase` singleton
2. Setup `CommandDispatcher` with all command modules
3. Start `AutosaveManager` for periodic saves
4. Bind TCP server to port 2323
5. Handle graceful shutdown with final player save

### Command Registration Order
Register in `setupCommands()` in this order:
1. `registerBasicCommands` (help, quit, look)
2. `registerAuthCommands` (login, signup)
3. `registerWorldCommands` (movement, exploration)  
4. `registerChatCommands` (say, shout, tell)

### Error Handling Patterns
- **Command Errors**: Catch in `CommandDispatcher.dispatch()`, show user-friendly message
- **Database Errors**: Log server-side, return generic error to user
- **Session Errors**: Log with session ID, emit 'disconnect' event for cleanup