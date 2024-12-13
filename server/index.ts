import express, { type Request, Response, NextFunction } from "express";
import type { Server as HttpServer } from "http";
import { setupRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import { setupAuth } from "./auth";
import path from "path";
import fs from "fs";

// Configure structured logging with request details
process.env.DEBUG = '*';
const logger = {
  info: (...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.log(timestamp, '[INFO]', ...args);
  },
  warn: (...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.warn(timestamp, '[WARN]', ...args);
  },
  error: (...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.error(timestamp, '[ERROR]', ...args);
  },
  debug: (...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.debug(timestamp, '[DEBUG]', ...args);
  }
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

// Define paths at the top level
const rootPath = process.cwd();
const publicPath = path.join(rootPath, 'dist', 'public');
const mediaPath = path.join(rootPath, 'public');
const mediaDirs = ['images', 'audio'].map(dir => {
  const dirPath = path.join(mediaPath, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`Created media directory: ${dirPath}`);
  }
  return dirPath;
});

// Configure media files serving with enhanced logging and proper headers
function serveMediaFiles(mediaType: 'images' | 'audio') {
  const mediaDir = path.join(mediaPath, mediaType);

  // Ensure directory exists
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
    logger.info(`Created media directory: ${mediaDir}`);
  }
  
  return [
    // CORS and basic headers middleware
    (req: Request, res: Response, next: NextFunction) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
      
      // Handle preflight
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }

      // Set basic security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      next();
    },

    // File validation and serving middleware
    (req: Request, res: Response) => {
      try {
        const filename = req.path.startsWith('/') ? req.path.slice(1) : req.path;
        const filePath = path.join(mediaDir, filename);
        
        // Validate file exists and type
        if (!fs.existsSync(filePath)) {
          logger.error(`${mediaType} file not found:`, { url: req.url, filename, filePath });
          return res.status(404).json({ error: `${mediaType} file not found` });
        }

        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
          throw new Error('Not a file');
        }

        const ext = path.extname(filePath).toLowerCase();
        if (mediaType === 'images' && !['.png', '.jpg', '.jpeg'].includes(ext)) {
          throw new Error('Invalid image type');
        } else if (mediaType === 'audio' && ext !== '.mp3') {
          throw new Error('Invalid audio type');
        }

        // Set content type and headers
        let contentType = 'application/octet-stream';
        if (mediaType === 'images') {
          contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
        } else if (mediaType === 'audio') {
          contentType = 'audio/mpeg';
        }

        // Set response headers
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        
        // Log response details
        logger.debug(`${mediaType} serving file:`, {
          url: req.url,
          filename,
          filePath,
          contentType,
          size: stats.size,
          headers: res.getHeaders()
        });

        // Stream the file
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      } catch (error) {
        const err = error as Error;
        logger.error(`Error serving ${mediaType} file:`, {
          url: req.url,
          error: err.message,
          stack: err.stack
        });
        res.status(500).json({ error: `Error serving ${mediaType} file` });
      }
    }
  ];
}

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
    
    // Setup static file serving and media paths
    logger.info('Setting up static file serving...', {
      rootPath,
      publicPath,
      mediaPath,
      mediaDirs
    });
    

    // Log existing media files
    ['images', 'audio'].forEach(dir => {
      const mediaDir = path.join(mediaPath, dir);
      if (fs.existsSync(mediaDir)) {
        const files = fs.readdirSync(mediaDir);
        logger.info(`Files in ${mediaDir}:`, files);
      }
    });

    // Configure media serving routes first
    logger.info('Setting up media serving...', { mediaPath });
    
    // Setup image serving
    app.use('/images', ...serveMediaFiles('images'));
    logger.info('Image serving configured');
    
    // Setup audio serving
    app.use('/audio', ...serveMediaFiles('audio'));
    logger.info('Audio serving configured');
    
    // Global error handler for media serving
    app.use('/images|/audio', (error: Error, req: Request, res: Response, next: NextFunction) => {
      const mediaType = req.path.startsWith('/images') ? 'image' : 'audio';
      logger.error(`${mediaType} serving error:`, {
        url: req.url,
        error: error.message,
        stack: error.stack
      });
      if (!res.headersSent) {
        res.status(500).json({ error: `Error serving ${mediaType} file` });
      }
    });
    
    // Setup media file serving first
    logger.info('Setting up media file serving paths:', {
      rootPath,
      publicPath,
      mediaPath,
      mediaDirs,
      timestamp: new Date().toISOString()
    });

    // Log existing media files
    ['images', 'audio'].forEach(dir => {
      const mediaDir = path.join(mediaPath, dir);
      if (fs.existsSync(mediaDir)) {
        const files = fs.readdirSync(mediaDir);
        logger.info(`Files in ${mediaDir}:`, files);
      }
    });

    // Configure media routes with improved error handling
    ['images', 'audio'].forEach(mediaType => {
      const mediaPath = `/` + mediaType;
      app.use(mediaPath, ...serveMediaFiles(mediaType as 'images' | 'audio'));
      
      // Add error handler for each media type
      app.use(mediaPath, (error: Error, req: Request, res: Response, next: NextFunction) => {
        logger.error(`Error serving ${mediaType}:`, {
          url: req.url,
          error: error.message,
          stack: error.stack
        });
        res.status(500).json({ error: `Error serving ${mediaType} file` });
      });
    });

    // Setup Vite in development mode
    if (isDevelopment) {
      logger.info('Setting up Vite middleware...');
      await setupVite(app, server);
    }
    
    // Register API routes after middleware setup
    logger.info('Setting up API routes...');
    setupRoutes(app);


    // Error handling middleware for media files
    const handleMediaError = (err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Media file error:', {
        error: err.message,
        path: req.path,
        timestamp: new Date().toISOString()
      });
      
      if (err.message.includes('ENOENT')) {
        return res.status(404).json({ error: 'Media file not found' });
      }
      
      next(err);
    };

    // Apply error handler after media routes
    app.use('/images', handleMediaError);
    app.use('/audio', handleMediaError);

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