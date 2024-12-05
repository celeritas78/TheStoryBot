import express, { Request, Response, NextFunction } from "express";
import { setupRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import { setupAuth } from "./auth";
import csrf from "csurf";

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
app.use(express.static("client/public"));

// Call setupAuth before routes
setupAuth(app);

// CSRF Token Endpoint
app.get("/api/csrf-token", (req: Request, res: Response) => {
  try {
    const csrfToken = req.csrfToken();
    console.log("CSRF Token generated:", csrfToken);
    res.json({ csrfToken });
  } catch (error) {
    console.error("Error generating CSRF token:", error);
    res.status(500).json({ error: "Failed to generate CSRF token" });
  }
});

// Register API routes
setupRoutes(app);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.code === "EBADCSRFTOKEN") {
    console.error("Invalid CSRF token:", err);
    return res
      .status(403)
      .json({ error: "Invalid CSRF token. Please refresh and try again." });
  }
  console.error("Global error handler:", { error: err, stack: err.stack });
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

(async () => {
  const server = createServer(app);

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const PORT = 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
})();
