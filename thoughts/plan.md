## Description
Build a local-only TypeScript Multiuser Dungeon (MUD) prototype of San Antonio landmarks.  
Players connect via telnet on port 2323, can sign up/login, move between rooms, and chat with each other.  
Persistence is via SQLite, running in Docker. Prototype only, with occasional testing.

## Phase 1 — Scaffold
- [x] Initialize repo with `npm init -y`
- [x] Install deps: `npm i typescript ts-node @types/node better-sqlite3 bcrypt`
- [x] Install dev deps: `npm i -D vitest @types/better-sqlite3 @types/bcrypt`
- [x] Create `tsconfig.json` targeting ES2022 commonjs
- [x] Add npm scripts: `dev`, `build`, `start`, `test`, `seed`
- [x] Create folder structure under `src/` with stub files
- [x] Create `docker-compose.yml` for Node + SQLite volume
- [x] Verify `npm run dev` boots and exits cleanly

## Phase 2 — Telnet Listener
- [x] Implement TCP server on port 2323 using Node `net`
- [x] Implement line codec (handle CRLF/newlines)
- [x] On connect: show banner + prompt
- [x] Add command dispatcher stub with error for unknown commands
- [x] Implement `help` command
- [x] Implement `quit` command
- [x] Clean up sessions on disconnect

## Phase 3 — Database + Accounts
- [x] [P] Implement SQLite bootstrap with `better-sqlite3`
- [x] [P] Run migrations for `users` and `players` tables
- [x] [P] Add bcrypt password hash/verify
- [x] [P] Implement `signup` command flow
- [x] [P] Implement `login` command flow
- [x] [P] Implement `quit` to persist player location
- [x] [P] Add autosave helper

## Phase 4 — World + Movement
- [x] [P] Create `rooms` and `exits` tables
- [x] [P] Write `seed.ts` with 7 San Antonio rooms + exits
- [x] [P] Implement `look` command (description, exits, players)
- [x] [P] Implement `where` command
- [x] [P] Implement `move <dir>` and shortcuts `n/s/e/w`
- [ ] [P] Update player’s room on move + autosave

## Phase 5 — Presence + Chat
- [ ] [P] Maintain presence map: `roomId -> Set<sessionIds>`
- [ ] [P] Update presence on login and room change
- [ ] [P] Announce room entry/exit
- [ ] [P] Implement `say <msg>` for room chat
- [ ] [P] Implement `shout <msg>` for global chat
- [ ] [P] Implement `who` to show online players

## Phase 6 — Polish + Ops
- [ ] Normalize whitespace + ignore empty lines
- [ ] Improve unknown command error with `help` hint
- [ ] Expand `help` to list all implemented commands
- [ ] Add autosave on movement and every N ops
- [ ] Add idle timeout disconnect
- [ ] Create `.env` for `PORT` and `DB_PATH`
- [ ] Update `docker-compose.yml` with bind-mounted `./data`
- [ ] Add README quickstart with telnet instructions
- [ ] Add minimal Vitest smoke tests (parser, movement, chat)