# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
SAMud is a San Antonio-themed text-based Multiuser Dungeon (MUD) accessible via telnet. Players connect on port 2323, explore San Antonio landmarks, and interact with other players through chat commands.

## Development Commands

### Core Commands
```bash
npm run dev      # Run the MUD server with ts-node (development)
npm run build    # Compile TypeScript to JavaScript
npm run start    # Run compiled JavaScript (production)
npm run test     # Run tests with Vitest
npm run seed     # Seed the database with San Antonio locations
```

### Testing
```bash
npm run test              # Run all tests with Vitest
npx vitest run <file>     # Run specific test file
npx vitest watch          # Run tests in watch mode
npx vitest run src/tests/user.test.ts  # Example: run user model tests
```

## Architecture

### Tech Stack
- **Runtime**: Node.js with TypeScript
- **Database**: SQLite via better-sqlite3
- **Testing**: Vitest
- **Server**: Native Node.js `net` module for TCP/telnet connections
- **Authentication**: bcrypt for password hashing

### Project Structure
- `src/` - TypeScript source code
  - `index.ts` - Main server entry point with dotenv configuration
  - `server/` - TCP server and session management
    - `server.ts` - MudServer class handling connections and command routing
    - `session.ts` - Individual client session handling with telnet protocol
    - `sessionManager.ts` - Global session tracking and room presence
  - `commands/` - Command system with modular registration
    - `commandDispatcher.ts` - Central command parsing and routing
    - `authCommands.ts` - Login/signup authentication flow
    - `worldCommands.ts` - Movement and room interaction
    - `chatCommands.ts` - Say/shout communication
    - `basicCommands.ts` - Help, quit, and utility commands
  - `models/` - Database models and business logic
    - `user.ts` - User authentication and account management
    - `player.ts` - Player state and location tracking
    - `room.ts` - Room data and exit navigation
  - `database/` - SQLite setup and data management
    - `db.ts` - Database connection and schema initialization
    - `seed.ts` - World population with San Antonio locations
  - `utils/` - Supporting utilities
    - `autosave.ts` - Periodic player state persistence
  - `tests/` - Vitest unit tests
- `dist/` - Compiled JavaScript output

### Key Implementation Notes
1. **Telnet Protocol**: Server runs on port 2323, handles CRLF line endings
2. **Database Schema**: Includes `users`, `players`, `rooms`, and `exits` tables
3. **Session Management**: SessionManager tracks active connections and player locations
4. **Presence System**: Maps room IDs to active sessions for multi-user awareness
5. **Chat System**: Both room-based (`say`) and global (`shout`) messaging
6. **Command Architecture**: Modular command registration system with CommandDispatcher
7. **State Management**: Sessions track authentication state and current room location
8. **Autosave System**: Periodic saving of player state and graceful shutdown handling

### Database Persistence
- Player state (location) saved on quit and periodically
- SQLite database file persisted via Docker volume or local filesystem
- Passwords hashed with bcrypt before storage

## Development Status
The project has completed the core implementation phases:
1. ✅ **Scaffold** - Project setup and dependencies
2. ✅ **Telnet Listener** - TCP server and command dispatcher
3. ✅ **Database + Accounts** - User authentication and persistence
4. ✅ **World + Movement** - Rooms, exits, and navigation
5. ✅ **Presence + Chat** - Multi-user awareness and communication
6. 🔄 **Polish + Ops** - Error handling, timeouts, and deployment (ongoing)

## San Antonio Locations
The MUD includes these landmark rooms:
- The Alamo Plaza
- River Walk North
- River Walk South
- The Pearl
- Tower of the Americas
- Mission San Jose
- Southtown

## Testing Approach
Use Vitest for unit tests focusing on:
- Command parsing and validation (src/tests/commandDispatcher.test.ts)
- Movement between rooms (src/tests/room.test.ts)
- User authentication and management (src/tests/user.test.ts)
- Database operations and model interactions

### Environment Variables
- `NODE_ENV` - Environment (development/production)
- `DB_PATH` - SQLite database file path (default: ./mud.db)
- `PORT` - Server port (default: 2323)