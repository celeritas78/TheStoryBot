import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: "custom",
  });


  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.json(req.user);
    }

    res.status(401).json({ error: "Not logged in" });
  });



  // Vite middlewares
  app.use(vite.middlewares);

  // Serve the React app for non-API routes
  app.use(async (req, res, next) => {
    // Bypass Vite middleware for API routes
    if (req.originalUrl.startsWith("/api")) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(__dirname, "..", "client", "index.html");
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });

}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Serve static files for the public directory
  app.use(express.static(distPath));

  // Fallback to React's index.html for non-API routes
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
