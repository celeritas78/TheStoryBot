import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session, { SessionData } from "express-session";
import createMemoryStore from "memorystore";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import csrf from "csurf";
import { promisify } from "util";
import { users, type User as SelectUser } from "@db/schema";
import { db } from "../db";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod";

// Extend SessionData to include our custom properties
declare module 'express-session' {
  interface SessionData {
    user?: Omit<SelectUser, 'password'>;
  }
}

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
  generateVerificationToken: () => {
    return randomBytes(32).toString('hex');
  }
};

// Extend Express Session and User types
declare global {
  namespace Express {
    interface User extends SelectUser {}
    
    interface Session {
      user?: Omit<SelectUser, 'password'>;
    }
  }
}

// Type for the safe user data (excluding password)
type SafeUser = Omit<SelectUser, 'password'>;

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
    name: 'sid',
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
      sameSite: 'lax'
    }
  };

  // Configure trust proxy settings
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    app.set("trust proxy", 1); // Trust first proxy
    sessionSettings.proxy = true; // Trust proxy headers
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
      const verificationToken = crypto.generateVerificationToken();
      const verificationTokenExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      // First create the user
      const [newUser] = await db.insert(users).values({
        email,
        password: hashedPassword,
        emailVerified: false,
        verificationToken,
        verificationTokenExpiry,
        createdAt: now,
        updatedAt: now,
      }).returning();

      // Then try to send the verification email
      try {
        const { emailService } = await import('./utils/email');
        const emailSent = await emailService.sendVerificationEmail(email, verificationToken);

        res.status(201).json({ 
          message: emailSent 
            ? "Registration successful! Please check your email to verify your account." 
            : "Registration successful, but email verification is currently unavailable.",
          user: { id: newUser.id, email: newUser.email, emailVerified: false }
        });
      } catch (error) {
        console.error('Registration error:', error);
        res.status(201).json({ 
          message: "Registration successful, but email verification is currently unavailable.",
          user: { id: newUser.id, email: newUser.email, emailVerified: false }
        });
      }
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: "Registration failed", details: err.message });
    }
  });

  // Email verification endpoint
  app.get("/api/verify-email/:token", async (req, res) => {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ 
        error: "Missing verification token",
        message: "No verification token provided. Please check your verification email and try again."
      });
    }

    console.log('Verifying token:', token);

    try {
      const now = new Date();
      // First try to find user by token
      const users_result = await db
        .select()
        .from(users)
        .where(eq(users.verificationToken, token));
      
      console.log('Step 1 - Query results:', {
        usersFound: users_result.length,
        token,
        firstUser: users_result[0] ? {
          id: users_result[0].id,
          email: users_result[0].email,
          emailVerified: users_result[0].emailVerified,
          tokenMatch: users_result[0].verificationToken === token,
          tokenExpiry: users_result[0].verificationTokenExpiry
        } : null
      });
      
      let user = users_result[0];

      // If no user found by token, check if there's a recently verified user
      if (!user) {
        console.log('Step 2 - No user found with token, checking recently verified users');
        // Look for user verified in the last hour
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const [recentlyVerifiedUser] = await db
          .select()
          .from(users)
          .where(and(
            eq(users.emailVerified, true),
            sql`${users.updatedAt} > ${oneHourAgo}`
          ))
          .orderBy(sql`${users.updatedAt} DESC`)
          .limit(1);

        if (recentlyVerifiedUser) {
          console.log('Step 2a - Found recently verified user:', {
            id: recentlyVerifiedUser.id,
            email: recentlyVerifiedUser.email,
            verifiedAt: recentlyVerifiedUser.updatedAt
          });
          return res.status(200).json({
            message: "Email has already been verified",
            user: {
              id: recentlyVerifiedUser.id,
              email: recentlyVerifiedUser.email,
              emailVerified: true
            }
          });
        }

        console.log('Step 2b - No verified user found, token is invalid');
        return res.status(404).json({ 
          error: "Invalid verification token",
          message: "This verification link is invalid or has expired. Please request a new verification email."
        });
      }

      // If user found by token but already verified
      if (user.emailVerified) {
        console.log('Step 3 - User found by token and already verified:', {
          id: user.id,
          email: user.email
        });
        return res.status(200).json({ 
          message: "Email already verified",
          user: {
            id: user.id,
            email: user.email,
            emailVerified: true
          }
        });
      }

      console.log('Step 3 - Processing verification for user:', {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        currentTime: now.toISOString(),
        tokenExpiry: user.verificationTokenExpiry?.toISOString()
      });

      if (user.emailVerified) {
        return res.status(400).json({ 
          error: "Already verified",
          message: "Your email has already been verified. You can proceed to login."
        });
      }

      if (user.verificationTokenExpiry && user.verificationTokenExpiry < now) {
        console.log('Token expired at:', user.verificationTokenExpiry, 'current time:', now);
        // Clear expired token
        await db
          .update(users)
          .set({
            verificationToken: null,
            verificationTokenExpiry: null,
            updatedAt: now,
          })
          .where(eq(users.id, user.id));

        return res.status(400).json({ 
          error: "Token expired",
          message: "This verification link has expired. Please request a new verification email."
        });
      }

      try {
        console.log('Step 4 - Attempting to update user verification status:', {
          userId: user.id,
          currentStatus: user.emailVerified,
          updateTime: now.toISOString()
        });

        // Update user as verified in a transaction to ensure atomicity
        const [updatedUser] = await db
          .update(users)
          .set({
            emailVerified: true,
            verificationToken: null,
            verificationTokenExpiry: null,
            updatedAt: now,
          })
          .where(eq(users.id, user.id))
          .returning();

        console.log('Step 5 - Update result:', {
          success: !!updatedUser,
          updatedUser: updatedUser ? {
            id: updatedUser.id,
            email: updatedUser.email,
            emailVerified: updatedUser.emailVerified,
            verificationToken: updatedUser.verificationToken
          } : null
        });

        if (!updatedUser) {
          console.log('Step 5a - Failed to update user');
          return res.status(500).json({
            error: "Verification failed",
            message: "Failed to update verification status. Please try again."
          });
        }

        // Log the user in after verification
        req.login(updatedUser, (err) => {
          if (err) {
            return res.status(500).json({ 
              error: "Login failed",
              message: "Email verified successfully but failed to log you in. Please try logging in manually."
            });
          }
          res.json({ 
            message: "Email verified successfully",
            user: {
              id: updatedUser.id,
              email: updatedUser.email,
              emailVerified: true
            }
          });
        });
      } catch (error) {
        console.error('Failed to update user verification status:', error);
        return res.status(500).json({
          error: "Verification failed",
          message: "An error occurred while updating verification status. Please try again."
        });
      }
    } catch (error) {
      console.error('Email verification error:', error);
      const err = error as Error;
      res.status(500).json({ 
        error: "Verification failed",
        message: "An unexpected error occurred during verification. Please try again later.",
        details: err.message
      });
    }
  });

  // Login route
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ 
          message: "Login failed", 
          error: err.message 
        });
      }

      if (!user) {
        console.log('Authentication failed:', info?.message || 'Invalid credentials');
        return res.status(401).json({ 
          message: "Authentication failed",
          error: info?.message || "Invalid email or password"
        });
      }

      req.logIn(user, (err) => {
        if (err) {
          console.error('Session initialization failed:', err);
          return res.status(500).json({ 
            message: "Login failed", 
            error: "Failed to initialize session" 
          });
        }

        const { password, ...safeUser } = user;
        const response = { 
          message: "Login successful", 
          user: safeUser as SafeUser,
          isAuthenticated: true
        };

        // Save user data in session
        req.session.user = safeUser as SafeUser;
        
        // Save session before sending response
        req.session.save((err) => {
          if (err) {
            console.error('Session save failed:', err);
            return res.status(500).json({ 
              message: "Login failed", 
              error: "Failed to save session" 
            });
          }
          console.log('Login successful:', { id: user.id, email: user.email });
          res.json(response);
        });
      });
    })(req, res, next);
  });

  // Logout route
  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.json({ message: "Logout successful" });
    });
  });

  // Fetch current user route
  // Update profile route
  app.put("/api/profile", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not logged in" });
    }

    const { displayName, bio, avatarUrl } = req.body;
    
    db.update(users)
      .set({
        displayName,
        bio,
        avatarUrl,
        updatedAt: new Date()
      })
      .where(eq(users.id, req.user.id))
      .returning()
      .then(([updatedUser]) => {
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }
        const { password, ...userData } = updatedUser;
        res.json(userData);
      })
      .catch((error) => {
        console.error('Failed to update profile:', error);
        res.status(500).json({ message: "Failed to update profile" });
      });
  });

  app.get("/api/user", (req, res) => {
  // Delete account route
  app.delete("/api/account", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Not logged in" });
      }

      const userId = req.user.id;
      
      // Delete the user from the database
      const [deletedUser] = await db
        .delete(users)
        .where(eq(users.id, userId))
        .returning();

      if (!deletedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Destroy the session
      req.logout((err) => {
        if (err) {
          console.error('Error during logout after account deletion:', err);
          return res.status(500).json({ message: "Error during logout" });
        }
        
        req.session.destroy((err) => {
          if (err) {
            console.error('Error destroying session after account deletion:', err);
            return res.status(500).json({ message: "Error destroying session" });
          }
          
          res.json({ message: "Account deleted successfully" });
        });
      });
    } catch (error) {
      console.error('Account deletion error:', error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

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
