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

// Express static middleware with no logging for static files
app.use(express.static('client/public', {
  // Disable logging for static files
  logger: false,
  // Set cache headers
  maxAge: '1d',
  // Don't generate etags
  etag: false,
  // Don't list directories
  redirect: false
}));

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

  const port = Number(process.env.PORT) || 3000;
  
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use`);
      process.exit(1);
    }
    console.error('Server error:', error);
    process.exit(1);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Server started on port ${port} (${app.get('env')})`);
  });
})();
