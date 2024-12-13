import express, { type Request, Response, NextFunction } from "express";
import { setupRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import { setupAuth } from "./auth";
import path from "path";
import fs from "fs";

// Configure structured logging
process.env.DEBUG = process.env.NODE_ENV === 'development' ? 'app:*' : 'false';
const logger = {
  info: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(new Date().toISOString(), '[INFO]', ...args);
    }
  },
  warn: (...args: any[]) => console.warn(new Date().toISOString(), '[WARN]', ...args),
  error: (...args: any[]) => console.error(new Date().toISOString(), '[ERROR]', ...args)
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

// Disable express debug logging
app.set('debug', false);
app.disable('verbose');
app.disable('log');
app.set('env', 'production'); // Disable express development logging

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Disable express logging and headers
app.set('debug', false);
app.disable('verbose');
app.disable('log');
app.set('env', 'production'); // Disable express development logging
app.disable('x-powered-by');

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
    // Default to port 3000, but allow override through PORT env var
    let port = Number(process.env.PORT || 3000);
    const host = '0.0.0.0';
    
    // Always log server initialization
    console.log('Server initializing:', { 
      port,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
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
      // Configure static file serving for public directory and media files
      const publicPath = path.resolve(process.cwd(), 'public');
      const mediaPath = path.resolve(process.cwd(), '.');
      
      console.log('Setting up static file serving:', { 
        publicPath,
        mediaPath,
        exists: {
          public: fs.existsSync(publicPath),
          media: fs.existsSync(mediaPath)
        },
        contents: {
          public: fs.existsSync(publicPath) ? fs.readdirSync(publicPath) : [],
          media: fs.existsSync(mediaPath) ? fs.readdirSync(mediaPath).filter(f => f === 'images' || f === 'audio') : []
        }
      });

      // Serve media files (images and audio) from root directory
      app.use('/images', express.static(path.join(mediaPath, 'images'), {
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
          const ext = path.extname(filePath).toLowerCase();
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
          
          if (ext === '.png') {
            res.setHeader('Content-Type', 'image/png');
          } else if (ext === '.jpg' || ext === '.jpeg') {
            res.setHeader('Content-Type', 'image/jpeg');
          }
        }
      }));

      app.use('/audio', express.static(path.join(mediaPath, 'audio'), {
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
          res.setHeader('Content-Type', 'audio/mpeg');
        }
      }));

      // Serve static files for public directory
      app.use(express.static(publicPath));

      // Fallback route for SPA
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

    // Start the server with retry logic for port conflicts
    await new Promise<void>((resolve, reject) => {
      const tryListen = (retryPort: number) => {
        server.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            console.log(`Port ${retryPort} is in use, trying port ${retryPort + 1}`);
            server.close();
            tryListen(retryPort + 1);
          } else {
            console.error('Server startup error:', {
              error: error.message,
              code: error.code,
              stack: error.stack,
              timestamp: new Date().toISOString()
            });
            reject(error);
          }
        });

        server.listen(retryPort, host, () => {
          port = retryPort; // Update the port number if we had to change it
          console.log('Server started successfully:', {
            port: retryPort,
            host,
            environment: process.env.NODE_ENV,
            timestamp: new Date().toISOString()
          });
          resolve();
        });
      };

      tryListen(port);
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
