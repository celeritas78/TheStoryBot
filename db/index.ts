import { drizzle } from "drizzle-orm/node-postgres";
import pg from 'pg';
import { type Pool } from 'pg';
import * as schema from "./schema";

// Enhanced Logger utility for database operations with rate limiting
const dbLogger = {
  // Store last log timestamp and count for rate limiting
  lastLog: { timestamp: 0, message: '', count: 0 },
  
  // Log levels
  levels: {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  },
  
  // Current log level (can be adjusted based on environment)
  currentLevel: process.env.NODE_ENV === 'production' ? 1 : 2,

  shouldLog(message: string): boolean {
    const now = Date.now();
    const rateLimitWindow = 5000; // 5 seconds window
    
    if (this.lastLog.message === message) {
      // If the same message appears within the window
      if (now - this.lastLog.timestamp < rateLimitWindow) {
        this.lastLog.count++;
        // Only log every 10th occurrence within window
        return this.lastLog.count % 10 === 0;
      } else {
        // Reset counter if outside window
        if (this.lastLog.count > 1) {
          this.summarize();
        }
        this.lastLog = { timestamp: now, message, count: 1 };
        return true;
      }
    } else {
      // Different message, reset counter
      if (this.lastLog.count > 1) {
        this.summarize();
      }
      this.lastLog = { timestamp: now, message, count: 1 };
      return true;
    }
  },

  summarize() {
    if (this.lastLog.count > 1) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        context: "database",
        message: `${this.lastLog.message} (occurred ${this.lastLog.count} times)`,
      }));
    }
  },

  info: (message: string, data: Record<string, any> = {}) => {
    if (dbLogger.currentLevel >= dbLogger.levels.INFO && dbLogger.shouldLog(message)) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        context: "database",
        message,
        ...data,
      }));
    }
  },

  error: (message: string, error: any) => {
    // Always log errors regardless of rate limiting
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

// Add event listeners for pool events with reduced noise
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    dbLogger.info('Database pool connection established');
  }
});

pool.on('error', (err) => {
  dbLogger.error('Unexpected database pool error', err);
});

// Only log pool events in development with high verbosity
if (process.env.NODE_ENV === 'development' && process.env.DB_LOG_LEVEL === 'debug') {
  pool.on('acquire', () => {
    dbLogger.info('Client acquired from pool');
  });

  pool.on('remove', () => {
    dbLogger.info('Client removed from pool');
  });
}

// Initialize Drizzle with the pool
export const db = drizzle(pool, {
  schema,
  logger: {
    logQuery: (query: string, params: unknown[]) => {
      // Skip logging for common queries in production
      if (process.env.NODE_ENV === 'production' && (
        query.toLowerCase().includes('select') || 
        query.toLowerCase().includes('where id =')
      )) {
        return;
      }

      const maskedParams = params.map(param => 
        typeof param === 'string' && (param.includes('@') || param.length > 20) 
          ? '****' 
          : param
      );

      // Truncate long queries in logs
      const truncatedQuery = query.length > 100 
        ? query.substring(0, 100) + '...' 
        : query;

      dbLogger.info('DB Query', {
        query: truncatedQuery,
        params: maskedParams
      });
    },
  },
});

export { dbLogger };
