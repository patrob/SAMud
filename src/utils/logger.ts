import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname'
    }
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV || 'development'
  }
});

export const sessionLogger = logger.child({ component: 'session' });
export const commandLogger = logger.child({ component: 'command' });
export const authLogger = logger.child({ component: 'auth' });
export const chatLogger = logger.child({ component: 'chat' });
export const worldLogger = logger.child({ component: 'world' });
export const serverLogger = logger.child({ component: 'server' });
export const dbLogger = logger.child({ component: 'database' });