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

// Initialize and verify critical services
async function initializeServices() {
  try {
    await initializeStripeService();
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe failed to initialize after successful service start');
    }
    
    // Test Stripe connection
    await stripe.paymentMethods.list({ limit: 1 });
    console.log('Stripe service verified and ready', {
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to initialize Stripe service:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    throw error; // Propagate the error to prevent server start
  }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize services before setting up routes
async function startServer() {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log('Starting service initialization...', {
    requestId,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY
  });

  let stripeInitialized = false;

  // Initialize Stripe if the key is available
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      await initializeServices();
      stripeInitialized = true;
      
      console.log('Services initialized successfully', {
        requestId,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        stripeEnabled: true
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Log the error but don't exit - payment features will be disabled
      console.error('Payment services initialization failed:', {
        requestId,
        error: errorMessage,
        stack: errorStack,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      // Continue app startup without Stripe
      console.log('Continuing without payment services - features will be limited', {
        requestId,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        stripeEnabled: false,
        reason: errorMessage
      });
    }
  } else {
    console.warn('STRIPE_SECRET_KEY not provided - payment features will be disabled', {
      requestId,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV
    });
  }

  return stripeInitialized;
}

// Initialize services and start the server
let stripeEnabled = false;
try {
  stripeEnabled = await startServer();
  console.log('Server initialization completed:', {
    stripeEnabled,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
} catch (error) {
  console.error('Failed to initialize server:', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
  // Continue without Stripe - features will be limited
  console.log('Continuing without payment features - functionality will be limited');
}

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

// Serve static files from client/public directory with proper configuration
app.use(express.static('client/public', {
  maxAge: '1d',
  etag: false,
  redirect: false,
  index: false // Prevent serving index.html for /
}));

// Call setupAuth before routes
setupAuth(app);

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
  const port = Number(process.env.PORT) || 3000;
  const host = '0.0.0.0';

  // Add shutdown handler with improved cleanup
  function handleShutdown(signal?: string) {
    const requestId = Math.random().toString(36).substring(7);
    console.log('Server shutdown initiated', {
      signal,
      requestId,
      timestamp: new Date().toISOString()
    });

    let forceShutdownTimer: NodeJS.Timeout;

    // Create a promise that resolves when the server closes
    const closeServer = new Promise<void>((resolve) => {
      server.close(() => {
        console.log('Server closed gracefully', {
          requestId,
          timestamp: new Date().toISOString()
        });
        resolve();
      });
    });

    // Set a timeout for force shutdown
    const forceShutdown = new Promise<void>((resolve) => {
      forceShutdownTimer = setTimeout(() => {
        console.error('Force shutting down server after timeout', {
          requestId,
          timestamp: new Date().toISOString()
        });
        resolve();
      }, 10000);
    });

    // Wait for either graceful shutdown or force shutdown
    Promise.race([closeServer, forceShutdown])
      .then(() => {
        clearTimeout(forceShutdownTimer);
        process.exit(0);
      })
      .catch((error) => {
        console.error('Error during shutdown:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          requestId,
          timestamp: new Date().toISOString()
        });
        process.exit(1);
      });
  }

  // Handle termination signals
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    handleShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', {
      reason,
      promise,
      timestamp: new Date().toISOString()
    });
  });

  // Improved error handling for server startup
  server.on('error', (error: NodeJS.ErrnoException) => {
    const requestId = Math.random().toString(36).substring(7);
    if (error.code === 'EADDRINUSE') {
      console.error('Port binding failed:', {
        error: `Port ${port} is already in use`,
        port,
        host,
        requestId,
        timestamp: new Date().toISOString()
      });
      process.exit(1);
    }
    
    console.error('Server error:', {
      error: error.message,
      code: error.code,
      stack: error.stack,
      requestId,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  });

  // Start the server with enhanced logging
  try {
    await new Promise<void>((resolve, reject) => {
      server.listen(port, host, () => {
        console.log('Server started successfully:', {
          port,
          host,
          environment: app.get('env'),
          timestamp: new Date().toISOString()
        });
        resolve();
      });

      server.on('error', reject);
    });
  } catch (error) {
    console.error('Failed to start server:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      port,
      host,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
})();
