import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@db/schema";

// Enhanced Logger utility
const dbLogger = {
  info: (message: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      context: 'database',
      message,
      ...data
    }));
  },
  error: (message: string, error?: any, data: Record<string, any> = {}) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      context: 'database',
      message,
      error: error ? {
        message: error.message || error,
        stack: error.stack,
        code: error.code
      } : undefined,
      ...data
    }));
  },
  warn: (message: string, data: Record<string, any> = {}) => {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      context: 'database',
      message,
      ...data
    }));
  }
};

if (!process.env.DATABASE_URL) {
  dbLogger.error("DATABASE_URL is not set");
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

dbLogger.info("Initializing database connection pool");

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Add event listeners for pool events
pool.on('connect', () => {
  dbLogger.info('New client connected to the pool');
});

pool.on('error', (err) => {
  dbLogger.error('Unexpected error on idle client', err);
});

export const db = drizzle(pool, {
  schema,
  logger: {
    logQuery: (query: string, params: unknown[]) => {
      // Mask any potential sensitive data in params
      const maskedParams = params.map(param => 
        typeof param === 'string' && (param.includes('@') || param.length > 20) 
          ? '****' 
          : param
      );
      dbLogger.info('Executing query', {
        query,
        params: maskedParams
      });
    },
  },
});

// Export pool and logger for transaction management
export { pool, dbLogger };
