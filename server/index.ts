import express, { type Request, Response, NextFunction } from "express";
import { setupRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import { setupAuth } from "./auth";
import path from "path";

// Configure logging based on environment
const logLevel = process.env.NODE_ENV === 'production' ? 'error' : 'warn';
const logger = {
  info: (...args: any[]) => {
    if (process.env.DEBUG === 'true') {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => console.warn(...args),
  error: (...args: any[]) => console.error(...args),
};

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', {
    reason,
    promise,
    timestamp: new Date().toISOString()
  });
});

const app = express();
const server = createServer(app);

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize application services
async function initializeServices() {
  console.log('Starting application initialization...', {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
  
  // Initialize authentication first
  await setupAuth(app);
  return true;
}

// Initialize services and start the server
(async () => {
  try {
    const isDevelopment = process.env.NODE_ENV === 'development';
    // Use REPL_SLUG to detect Replit environment
    const isReplit = process.env.REPL_SLUG !== undefined;
    const port = Number(process.env.PORT) || 3000;
    const host = '0.0.0.0';
    
    console.log('Starting server initialization:', { 
      port, 
      host,
      environment: process.env.NODE_ENV,
      platform: isReplit ? 'replit' : 'local'
    });

    // Initialize core services
    await initializeServices();
    
    // Setup Vite in development mode first
    if (isDevelopment) {
      console.log('Setting up Vite middleware...');
      await setupVite(app, server);
    }
    
    // Register API routes after middleware setup
    console.log('Setting up API routes...');
    setupRoutes(app);

    // Error handling middleware
    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || 500;
      const message = err.message || "Internal Server Error";
      
      console.error(`${req.method} ${req.url} - Error:`, {
        status,
        message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
      
      res.status(status).json({ message });
    });

    // Setup static file serving and catch-all route for production
    if (!isDevelopment) {
      const publicPath = path.resolve(__dirname, '..', 'public');
      console.log('Setting up static file serving:', { publicPath });
      app.use(express.static(publicPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(publicPath, 'index.html'));
      });
    }

    // Handle shutdown gracefully
    function handleShutdown(signal?: string) {
      console.log('Server shutdown initiated', {
        signal,
        timestamp: new Date().toISOString()
      });

      server.close(() => {
        console.log('Server closed successfully', {
          timestamp: new Date().toISOString()
        });
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        console.error('Force shutting down after timeout', {
          timestamp: new Date().toISOString()
        });
        process.exit(1);
      }, 10000);
    }

    // Setup shutdown handlers
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    // Start the server
    await new Promise<void>((resolve, reject) => {
      server.on('error', (error: NodeJS.ErrnoException) => {
        console.error('Server startup error:', {
          error: error.message,
          code: error.code,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
        reject(error);
      });

      server.listen(port, host, () => {
        console.log('Server started successfully:', {
          port,
          host,
          environment: process.env.NODE_ENV,
          timestamp: new Date().toISOString()
        });
        resolve();
      });
    });

  } catch (error) {
    console.error('Fatal error during startup:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
})();
