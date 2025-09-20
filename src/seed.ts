#!/usr/bin/env node

import { DatabaseManager } from './db';

interface RoomData {
  id: number;
  name: string;
  description: string;
}

interface ExitData {
  fromRoomId: number;
  toRoomId: number;
  direction: string;
  shortDirection: string;
}

function seedWorld() {
  console.log('Seeding San Antonio MUD world...');
  
  const db = new DatabaseManager();
  
  // San Antonio themed rooms
  const rooms: RoomData[] = [
    {
      id: 1,
      name: 'The Alamo Plaza',
      description: 'Stone walls surround you. Tourists move in and out of the courtyard. The famous mission stands before you, a symbol of Texas independence.'
    },
    {
      id: 2,
      name: 'River Walk North',
      description: 'The water glistens as barges float past. Cafes line the banks with colorful umbrellas. The sound of flowing water mingles with laughter and conversation.'
    },
    {
      id: 3,
      name: 'River Walk South',
      description: 'Cypress trees drape over the water. Street musicians play mariachi music on the stone pathways. The aroma of Tex-Mex cuisine fills the air.'
    },
    {
      id: 4,
      name: 'The Pearl',
      description: 'The old brewery is alive with music and food. Families gather in the plaza while artisans display their crafts. Weekend farmers markets bustle with activity.'
    },
    {
      id: 5,
      name: 'Tower of the Americas',
      description: 'You stand at the base of the 750-foot tower. The observation deck looms high above, offering panoramic views of the city. HemisFair Park spreads out around you.'
    },
    {
      id: 6,
      name: 'Mission San Jose',
      description: 'Ancient limestone walls tell stories of Spanish colonization. The Rose Window catches afternoon light beautifully. Peaceful gardens surround the historic church.'
    },
    {
      id: 7,
      name: 'Southtown',
      description: 'Colorful murals decorate brick buildings. Local breweries and art galleries line the streets. The King William Historic District preserves Victorian-era charm.'
    }
  ];

  // Exits connecting the rooms
  const exits: ExitData[] = [
    // From Alamo Plaza
    { fromRoomId: 1, toRoomId: 2, direction: 'east', shortDirection: 'e' },
    { fromRoomId: 1, toRoomId: 3, direction: 'south', shortDirection: 's' },
    
    // From River Walk North
    { fromRoomId: 2, toRoomId: 1, direction: 'west', shortDirection: 'w' },
    { fromRoomId: 2, toRoomId: 3, direction: 'south', shortDirection: 's' },
    { fromRoomId: 2, toRoomId: 4, direction: 'north', shortDirection: 'n' },
    
    // From River Walk South
    { fromRoomId: 3, toRoomId: 1, direction: 'north', shortDirection: 'n' },
    { fromRoomId: 3, toRoomId: 2, direction: 'north', shortDirection: 'n' },
    { fromRoomId: 3, toRoomId: 5, direction: 'east', shortDirection: 'e' },
    { fromRoomId: 3, toRoomId: 7, direction: 'south', shortDirection: 's' },
    
    // From The Pearl
    { fromRoomId: 4, toRoomId: 2, direction: 'south', shortDirection: 's' },
    
    // From Tower of the Americas
    { fromRoomId: 5, toRoomId: 3, direction: 'west', shortDirection: 'w' },
    { fromRoomId: 5, toRoomId: 6, direction: 'south', shortDirection: 's' },
    
    // From Mission San Jose
    { fromRoomId: 6, toRoomId: 5, direction: 'north', shortDirection: 'n' },
    { fromRoomId: 6, toRoomId: 7, direction: 'west', shortDirection: 'w' },
    
    // From Southtown
    { fromRoomId: 7, toRoomId: 3, direction: 'north', shortDirection: 'n' },
    { fromRoomId: 7, toRoomId: 6, direction: 'east', shortDirection: 'e' }
  ];

  try {
    // Clear existing data
    console.log('Clearing existing world data...');
    (db as any).db.exec('DELETE FROM exits');
    (db as any).db.exec('DELETE FROM rooms');
    
    // Insert rooms
    console.log('Creating rooms...');
    const insertRoom = (db as any).db.prepare(`
      INSERT INTO rooms (id, name, description) 
      VALUES (?, ?, ?)
    `);
    
    for (const room of rooms) {
      insertRoom.run(room.id, room.name, room.description);
      console.log(`  Created: ${room.name}`);
    }
    
    // Insert exits
    console.log('Creating exits...');
    const insertExit = (db as any).db.prepare(`
      INSERT INTO exits (from_room_id, to_room_id, direction, short_direction)
      VALUES (?, ?, ?, ?)
    `);
    
    for (const exit of exits) {
      insertExit.run(exit.fromRoomId, exit.toRoomId, exit.direction, exit.shortDirection);
    }
    
    console.log(`Created ${exits.length} exits between rooms`);
    console.log('World seeding complete!');
    
  } catch (error) {
    console.error('Error seeding world:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

seedWorld();