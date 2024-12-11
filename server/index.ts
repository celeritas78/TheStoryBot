import express, { type Request, Response, NextFunction } from "express";
import { setupRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import { setupAuth } from "./auth";

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [express] ${message}`);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from client/public directory
app.use(express.static('client/public'));

// Call setupAuth before routes
setupAuth(app);

// Middleware to debug req.isAuthenticated
app.use((req, res, next) => {
  //console.log("Middleware stack check: ", req.isAuthenticated ? req.isAuthenticated() : "Undefined");
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

  const PORT = Number(process.env.PORT) || 5000;

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
    server.listen(PORT, '0.0.0.0', () => {
      log(`Server initialization complete`);
      log(`Server Details:
        Port: ${PORT}
        Environment: ${app.get('env')}
        Node Version: ${process.version}
        Start Time: ${new Date().toISOString()}
      `);
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('Server error:', {
          code: error.code,
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
      }
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
