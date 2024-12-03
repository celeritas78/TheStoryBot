import { drizzle } from "drizzle-orm/node-postgres";
import pg from 'pg';
import { type Pool } from 'pg';
import * as schema from "./schema";

// Enhanced Logger utility for database operations
const dbLogger = {
  info: (message: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "INFO",
      context: "database",
      message,
      ...data,
    }));
  },
  error: (message: string, error: any) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      context: "database",
      message,
      error: {
        message: error.message || error,
        stack: error.stack,
      },
    }));
  },
};

// Validate database URL
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Create a connection pool with improved configuration
export const pool: Pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  maxUses: 7500,
  allowExitOnIdle: true,
});

// Enhanced connection test with retry logic
async function testConnection(retries = 3, delay = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      dbLogger.info("Successfully connected to database", {
        attempt,
        status: 'success'
      });
      client.release();
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown database connection error');
      dbLogger.error(`Database connection attempt ${attempt} failed`, err);
      
      if (attempt === retries) {
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}

// Initialize connection test with retry
testConnection().then(success => {
  if (!success) {
    dbLogger.error("Failed to establish database connection after multiple attempts", new Error("Max retries reached"));
    process.exit(1);
  }
});

// Add event listeners for pool events
pool.on('connect', () => {
  dbLogger.info('New client connected to the pool');
});

pool.on('error', (err) => {
  dbLogger.error('Unexpected error on idle client', err);
});

pool.on('acquire', () => {
  dbLogger.info('Client acquired from pool');
});

pool.on('remove', () => {
  dbLogger.info('Client removed from pool');
});

// Initialize Drizzle with the pool
export const db = drizzle(pool, {
  schema,
  logger: {
    logQuery: (query: string, params: unknown[]) => {
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

export { dbLogger };
