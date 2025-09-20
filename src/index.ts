#!/usr/bin/env node

import { TelnetServer } from './server';

async function main() {
  console.log('San Antonio MUD server starting...');
  
  const port = parseInt(process.env.PORT || '2323');
  const server = new TelnetServer(port);
  
  try {
    await server.start();
    console.log(`Server ready! Connect with: telnet localhost ${port}`);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});