import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@db/schema";

// Logger utility
const dbLogger = {
  info: (message: string) => console.log(`[Database] ${message}`),
  error: (message: string) => console.error(`[Database Error] ${message}`),
};

if (!process.env.DATABASE_URL) {
  dbLogger.error("DATABASE_URL is not set");
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

dbLogger.info("Initializing database connection");

export const db = drizzle({
  connection: process.env.DATABASE_URL,
  schema,
  ws: ws,
  logger: {
    logQuery: (query: string, params: unknown[]) => {
      // Mask any potential sensitive data in params
      const maskedParams = params.map(param => 
        typeof param === 'string' && (param.includes('@') || param.length > 20) 
          ? '****' 
          : param
      );
      dbLogger.info(`Executing query: ${query} - Params: ${JSON.stringify(maskedParams)}`);
    },
  },
});
