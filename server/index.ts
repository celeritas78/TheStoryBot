import express, { type Request, Response, NextFunction } from "express";
import { setupRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import { setupAuth } from "./auth";
// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', {
    reason,
    promise,
    timestamp: new Date().toISOString()
  });
});

// Initialize application services
async function initializeServices() {
  console.log('Starting application initialization...', {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
}

const app = express();

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files with proper configuration
app.use(express.static('client/public', {
  maxAge: '1d',
  etag: false,
  redirect: false,
  index: false
}));

// Initialize authentication
setupAuth(app);

// Initialize services and start the server
(async () => {
  try {
    await initializeServices();
    
    // Register API routes
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

    const server = createServer(app);
    const port = Number(process.env.PORT) || 5000;
    const host = '0.0.0.0';

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

    // Development vs Production setup
    if (process.env.NODE_ENV === 'development') {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Start server
    await new Promise<void>((resolve, reject) => {
      server.listen(port, host, () => {
        console.log('Server started successfully:', {
          port,
          host,
          environment: process.env.NODE_ENV,
          timestamp: new Date().toISOString()
        });
        resolve();
      });

      server.on('error', (error: NodeJS.ErrnoException) => {
        console.error('Server startup error:', {
          error: error.message,
          code: error.code,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
        reject(error);
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