import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import csrf from "csurf";
import { promisify } from "util";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { users } from "@db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

export const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    const [hashedPassword, salt] = storedPassword.split(".");
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(suppliedPassword, salt, 64)) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
    }
  }
}

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);

  // Session Configuration
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "default-secret",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86400000 }),
      cookie: {
        secure: app.get("env") === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 86400000,
      },
    })
  );
  console.log("Session middleware initialized.");

  // Initialize Passport.js
  app.use(passport.initialize());
  app.use(passport.session());
  console.log("Authentication middleware initialized.");

  // CSRF protection for specific routes
  const csrfProtection = csrf({
    cookie: { secure: app.get("env") === "production", sameSite: "lax" },
  });
  app.use("/api/stories", csrfProtection);

  // CSRF Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    if (err.code === "EBADCSRFTOKEN") {
      console.error("Invalid CSRF token:", err);
      return res.status(403).json({ error: "Invalid CSRF token. Please refresh and try again." });
    }
    next(err);
  });

  // Passport Strategy
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

        if (!user) return done(null, false, { message: "Invalid email or password" });

        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) return done(null, false, { message: "Invalid email or password" });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      done(null, user || null);
    } catch (err) {
      console.error("Error deserializing user:", err);
      done(err);
    }
  });
}
