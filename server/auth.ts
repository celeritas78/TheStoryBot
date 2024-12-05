import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import csrf from "csurf";
import { promisify } from "util";
import { users, type User as SelectUser } from "@db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { z } from "zod";

// Promisify scrypt for password hashing
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

// Extend Express User object to match your schema
declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Validation schemas
const registrationSchema = z.object({
  email: z.string().email().min(5).max(255),
  password: z.string()
    .min(8)
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});

export function setupAuth(app: Express) {
  // Set up session store
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "default-secret",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({ 
      checkPeriod: 86400000 // Prune expired entries every 24h
    }),
    name: 'connect.sid',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
      path: '/'
    }
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1); // Trust reverse proxy for secure cookies
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());
  
  // CSRF protection temporarily disabled for testing
  // TODO: Re-enable CSRF protection before deploying to production

  // Configure Passport Local Strategy
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

  // Serialize and deserialize user
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      done(null, user || null);
    } catch (err) {
      done(err);
    }
  });


  // Registration route
  app.post("/api/register", async (req, res, next) => {
    try {
      const result = registrationSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Validation failed", details: result.error.errors });
      }

      const { email, password } = result.data;

      const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingUser.length > 0) {
        return res.status(409).json({ error: "Email already registered" });
      }

      const hashedPassword = await crypto.hash(password);
      const now = new Date();

      const [newUser] = await db.insert(users).values({
        email,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      }).returning();

      req.login(newUser, (err) => {
        if (err) return next(err);
        res.status(201).json({ message: "Registration successful", user: { id: newUser.id, email: newUser.email } });
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: "Registration failed", details: err.message });
    }
  });

  // Login route
  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    console.log('Login endpoint hit, authenticated user:', req.isAuthenticated());
    if (!req.user) {
      console.log('No user object after authentication');
      return res.status(401).json({ message: "Authentication failed" });
    }
    const user = req.user as SelectUser;
    console.log('User authenticated successfully:', { id: user.id, email: user.email });
    // Omit password and include all other user data
    const { password, ...safeUser } = user;
    const response = { 
      message: "Login successful", 
      user: safeUser,
      isAuthenticated: true
    };
    console.log('Sending login response:', response);
    res.json(response);
  });

  // Logout route
  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.json({ message: "Logout successful" });
    });
  });

  // Fetch current user route
  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Not logged in" });
    }
    
    if (!req.user) {
      return res.status(401).json({ message: "User session invalid" });
    }

    // Send all user data except password
    const { password, ...userData } = req.user;
    return res.json(userData);
  });
}
