import { MudDatabase } from './db';

interface RoomSeed {
  id: number;
  name: string;
  description: string;
}

interface ExitSeed {
  from: number;
  to: number;
  direction: string;
}

const rooms: RoomSeed[] = [
  {
    id: 1,
    name: 'The Alamo Plaza',
    description: 'Stone walls surround you. Tourists move in and out of the courtyard. The famous chapel stands before you, a monument to Texas independence.'
  },
  {
    id: 2,
    name: 'River Walk North',
    description: 'The water glistens as barges float past. Cafes line the banks. Mariachi music echoes from nearby restaurants.'
  },
  {
    id: 3,
    name: 'River Walk South',
    description: 'Cypress trees shade the walkway. The sound of water cascades from nearby fountains. Art galleries and shops beckon visitors.'
  },
  {
    id: 4,
    name: 'The Pearl',
    description: 'The old brewery is alive with music and food. Families gather in the plaza. The weekend farmers market fills the air with fresh aromas.'
  },
  {
    id: 5,
    name: 'Tower of the Americas',
    description: 'The observation deck offers stunning views of the city. The tower stretches 750 feet into the Texas sky. Below, Hemisfair Park spreads out like a green carpet.'
  },
  {
    id: 6,
    name: 'Mission San Jose',
    description: 'The Queen of the Missions stands majestically. Stone archways frame the courtyard. The rose window catches the light beautifully.'
  },
  {
    id: 7,
    name: 'Southtown',
    description: 'Colorful murals decorate the walls. Art studios and vintage shops line the streets. The King William district spreads to the east.'
  }
];

const exits: ExitSeed[] = [
  // Alamo Plaza connections
  { from: 1, to: 2, direction: 'east' },
  { from: 1, to: 3, direction: 'south' },

  // River Walk North connections
  { from: 2, to: 1, direction: 'west' },
  { from: 2, to: 3, direction: 'south' },
  { from: 2, to: 4, direction: 'north' },

  // River Walk South connections
  { from: 3, to: 1, direction: 'north' },
  { from: 3, to: 7, direction: 'south' },
  { from: 3, to: 5, direction: 'east' },

  // The Pearl connections
  { from: 4, to: 2, direction: 'south' },

  // Tower of the Americas connections
  { from: 5, to: 3, direction: 'west' },
  { from: 5, to: 7, direction: 'south' },

  // Mission San Jose connections
  { from: 6, to: 7, direction: 'north' },

  // Southtown connections
  { from: 7, to: 3, direction: 'north' },
  { from: 7, to: 5, direction: 'east' },
  { from: 7, to: 6, direction: 'south' }
];

export function seedSync() {
  console.log('Seeding database...');

  const database = MudDatabase.getInstance();
  const db = database.getDb();

  // Clear existing data
  console.log('Clearing existing seed data...');
  db.prepare('DELETE FROM exits').run();
  db.prepare('DELETE FROM rooms').run();

  // Insert rooms
  console.log('Creating rooms...');
  const insertRoom = db.prepare('INSERT INTO rooms (id, name, description) VALUES (?, ?, ?)');

  for (const room of rooms) {
    insertRoom.run(room.id, room.name, room.description);
    console.log(`  - Created: ${room.name}`);
  }

  // Insert exits
  console.log('Creating exits...');
  const insertExit = db.prepare('INSERT INTO exits (from_room_id, to_room_id, direction) VALUES (?, ?, ?)');

  for (const exit of exits) {
    insertExit.run(exit.from, exit.to, exit.direction);
    console.log(`  - Connected room ${exit.from} to room ${exit.to} (${exit.direction})`);
  }

  console.log('Database seeded successfully!');
  console.log(`Created ${rooms.length} rooms and ${exits.length} exits.`);
}

export async function seed() {
  console.log('Seeding database...');

  const database = MudDatabase.getInstance();
  const db = database.getDb();

  // Clear existing data
  console.log('Clearing existing seed data...');
  db.prepare('DELETE FROM exits').run();
  db.prepare('DELETE FROM rooms').run();

  // Insert rooms
  console.log('Creating rooms...');
  const insertRoom = db.prepare('INSERT INTO rooms (id, name, description) VALUES (?, ?, ?)');

  for (const room of rooms) {
    insertRoom.run(room.id, room.name, room.description);
    console.log(`  - Created: ${room.name}`);
  }

  // Insert exits
  console.log('Creating exits...');
  const insertExit = db.prepare('INSERT INTO exits (from_room_id, to_room_id, direction) VALUES (?, ?, ?)');

  for (const exit of exits) {
    insertExit.run(exit.from, exit.to, exit.direction);
    console.log(`  - Connected room ${exit.from} to room ${exit.to} (${exit.direction})`);
  }

  console.log('Database seeded successfully!');
  console.log(`Created ${rooms.length} rooms and ${exits.length} exits.`);
}

if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seed completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}