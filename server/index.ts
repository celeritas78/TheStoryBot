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

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Disable express logging and headers
app.set('debug', false);
app.disable('verbose');
app.disable('log');
app.set('env', 'production');
app.disable('x-powered-by');

// Initialize application services
async function initializeServices() {
  console.log('Starting application initialization...', {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
  
  await setupAuth(app);
  return true;
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

// Initialize services and start the server
(async () => {
  try {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isReplit = process.env.REPL_SLUG !== undefined;
    const port = Number(process.env.PORT || 3000);
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

    // Setup static file serving
    const rootPath = process.cwd();
    const publicPath = path.join(rootPath, 'dist', 'public');
    const mediaPath = path.join(rootPath, 'public');

    // Create media directories if they don't exist
    const mediaDirs = ['images', 'audio'].map(dir => path.join(mediaPath, dir));
    mediaDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Debug middleware for static file requests
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.url.startsWith('/images/') || req.url.startsWith('/audio/')) {
        console.log('Static file request:', {
          url: req.url,
          method: req.method,
          timestamp: new Date().toISOString(),
          mediaPath,
          requestPath: req.path,
          exists: fs.existsSync(path.join(mediaPath, req.path))
        });
      }
      next();
    });

    // Custom error handler for static files
    const handleStaticFileError = (err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Static file error:', {
        error: err.message,
        path: req.path,
        timestamp: new Date().toISOString()
      });
      next(err);
    };

    // Serve media files with enhanced logging and proper headers
    app.use('/images', express.static(path.join(mediaPath, 'images'), {
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
        
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.png') {
          res.setHeader('Content-Type', 'image/png');
        } else if (ext === '.jpg' || ext === '.jpeg') {
          res.setHeader('Content-Type', 'image/jpeg');
        }
      }
    }), handleStaticFileError);

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
    }), handleStaticFileError);

    // Serve static files for the client application
    app.use(express.static(publicPath));

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

    // Fallback route for SPA
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });

    // Start the server with retry logic
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