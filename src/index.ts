import dotenv from 'dotenv';
import { startServer } from './server/server';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

async function main() {
  try {
    logger.info({
      environment: process.env.NODE_ENV || 'development',
      database: process.env.DB_PATH || './mud.db'
    }, 'Starting San Antonio MUD...');

    await startServer();
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Failed to start server');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}