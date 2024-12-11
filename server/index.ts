import express, { type Request, Response, NextFunction } from "express";
import { setupRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import { setupAuth } from "./auth";
// Import required services
import { getStripe, initializeStripeService } from './services/stripe';

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [express] ${message}`);
}
// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', {
    reason,
    promise,
    timestamp: new Date().toISOString()
  });
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize and verify critical services
async function initializeServices() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('STRIPE_SECRET_KEY not provided - payment features will be disabled', {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV
    });
    return false;
  }

  try {
    await initializeStripeService();
    return true;
  } catch (error) {
    console.error('Payment services initialization failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    // Don't throw, return false to indicate Stripe is not available
    return false;
  }
}

// Initialize Express application and all services
async function startServer() {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log('Starting server initialization...', {
    requestId,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });

  try {
    // First set up auth and routes
    setupAuth(app);
    setupRoutes(app);

    // Then initialize Stripe and other services
    const stripeInitialized = await initializeServices();
    
    console.log('Server initialization completed', {
      requestId,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      stripeEnabled: stripeInitialized
    });

    return stripeInitialized;
  } catch (error) {
    console.error('Server initialization failed:', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

// Initialize services and start the server
const stripeEnabled = await startServer();

// Set up error handlers for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', {
    reason,
    promise,
    timestamp: new Date().toISOString()
  });
});

// Serve static files from client/public directory
app.use(express.static('client/public'));

// Call setupAuth before routes
setupAuth(app);

// Middleware to debug req.isAuthenticated
app.use((req, res, next) => {
  next();
});

// Logging middleware for API routes
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Register API routes before Vite middleware or static serving
  setupRoutes(app);

  // Error-handling middleware
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || 500;
    const message = err.message || "Internal Server Error";
    console.error(`${req.method} ${req.url} - Error:`, { status, message, stack: err.stack });
    res.status(status).json({ message });
  });

  const server = createServer(app);

  if (app.get("env") === "development") {
    // Vite middleware in development
    await setupVite(app, server);
  } else {
    // Serve static files in production
    serveStatic(app);
  }

  // Use port 3000 for development, otherwise use environment variable
  const PORT = process.env.PORT || 3000;

  // Add shutdown handler
  function handleShutdown() {
    log('Server shutting down...');
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });

    // Force close after 10s
    setTimeout(() => {
      log('Forcing server shutdown...');
      process.exit(1);
    }, 10000);
  }

  // Handle termination signals
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    handleShutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', {
      reason,
      promise,
      timestamp: new Date().toISOString()
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const port = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
      console.log('Starting server on port:', port);
      
      server.listen(port, '0.0.0.0', () => {
        log(`Server initialization complete`);
        log(`Server Details:
          Port: ${port}
          Environment: ${app.get('env')}
          Node Version: ${process.version}
          Start Time: ${new Date().toISOString()}
        `);
        resolve();
      });

      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${PORT} is already in use`);
          reject(new Error(`Port ${PORT} is already in use`));
        } else {
          console.error('Server error:', {
            code: error.code,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
          });
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('Failed to start server:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
})();
