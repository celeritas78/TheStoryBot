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

// Initialize error handlers
function setupErrorHandlers() {
  const errorHandler = (error: Error | unknown, context: string) => {
    console.error(`${context}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  };

  // Single handler for uncaught exceptions
  process.on('uncaughtException', (error) => errorHandler(error, 'Uncaught exception'));
  process.on('unhandledRejection', (reason) => errorHandler(reason, 'Unhandled rejection'));
}

// Initialize services in non-blocking way
async function initializeServicesAsync() {
  try {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    console.log('Starting service initialization...', {
      requestId,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV
    });

    if (process.env.STRIPE_SECRET_KEY) {
      try {
        await initializeStripeService();
        console.log('Stripe service initialized successfully', {
          requestId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
        return true;
      } catch (error) {
        console.error('Stripe initialization failed:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      console.warn('STRIPE_SECRET_KEY not provided - payment features will be disabled');
    }
    return false;
  } catch (error) {
    console.error('Service initialization error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return false;
  }
}

// Set up base middleware
setupErrorHandlers();
app.use(express.static('client/public'));

// Setup auth with proper error handling
try {
  await setupAuth(app);
  console.log('Auth setup completed successfully', {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
} catch (error) {
  console.error('Auth setup failed:', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
  throw error;
}

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const logData = {
        method: req.method,
        path,
        status: res.statusCode,
        duration: `${duration}ms`,
        body: JSON.stringify(body).slice(0, 100)
      };
      log(`${logData.method} ${logData.path} ${logData.status} in ${logData.duration}`);
    }
    return originalJson.call(res, body);
  };
  
  next();
});

// Start server function
async function bootServer() {
  const PORT = process.env.PORT || 3000;
  const server = createServer(app);
  
  // Setup routes and error handling
  try {
    setupRoutes(app);
  } catch (error) {
    console.error('Failed to setup routes:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
  
  // Global error handler
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || 500;
    const message = err.message || "Internal Server Error";
    console.error(`Error processing ${req.method} ${req.url}:`, {
      status,
      message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
    res.status(status).json({ message });
  });

  // Setup development/production middleware
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Graceful shutdown handler
  function handleShutdown(signal: string) {
    console.log(`Received ${signal}, initiating graceful shutdown...`);
    server.close((err) => {
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }
      console.log('Server closed successfully');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  }

  // Attach signal handlers
  process.once('SIGTERM', () => handleShutdown('SIGTERM'));
  process.once('SIGINT', () => handleShutdown('SIGINT'));

  // Start server
  return new Promise<void>((resolve, reject) => {
    const port = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
    
    console.log('Attempting to start server...', {
      port,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });

    const server = createServer(app);

    const serverError = (error: NodeJS.ErrnoException) => {
      console.error('Server error:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });

      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(error);
      }
    };

    try {
      server
        .on('error', serverError)
        .listen(port, '0.0.0.0', () => {
          console.log('Server listening:', {
            port,
            address: '0.0.0.0',
            environment: process.env.NODE_ENV,
            timestamp: new Date().toISOString()
          });
          resolve();
        });
    } catch (error) {
      console.error('Failed to start server:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      reject(error);
    }
  });
}

// Initialize services and start server
(async () => {
  try {
    console.log('Starting application bootstrap...', {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      nodeVersion: process.version
    });

    // Initialize services (non-blocking)
    initializeServicesAsync()
      .then(success => {
        console.log('Services initialization completed:', {
          success,
          timestamp: new Date().toISOString()
        });
      })
      .catch(error => {
        console.error('Services initialization error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        });
      });
    
    // Start server
    try {
      await bootServer();
      console.log('Server started successfully', {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
      });
    } catch (error) {
      console.error('Server startup error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  } catch (error) {
    console.error('Fatal error during startup:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
})();
