import dotenv from 'dotenv';
import { startServer } from './server/server';

// Load environment variables
dotenv.config();

async function main() {
  try {
    console.log('Starting San Antonio MUD...');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database: ${process.env.DB_PATH || './mud.db'}`);

    await startServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}