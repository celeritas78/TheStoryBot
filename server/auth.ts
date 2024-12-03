// Enhanced Logger utility for authentication
const authLogger = {
  maskSensitiveData: (data: Record<string, any> = {}): Record<string, any> => {
    const maskedData = { ...data };
    const sensitiveFields = ['password', 'token', 'resetToken', 'currentPassword', 'newPassword'];
    
    // Mask all sensitive fields
    sensitiveFields.forEach(field => {
      if (maskedData[field]) maskedData[field] = '****';
    });

    // Special handling for email
    if (maskedData.email) {
      maskedData.email = maskedData.email.replace(/(?<=.{3}).(?=.*@)/g, '*');
    }

    return maskedData;
  },

  info: (message: string, data: Record<string, any> = {}, context: string = 'general') => {
    const timestamp = new Date().toISOString();
    const maskedData = authLogger.maskSensitiveData(data);
    console.log(JSON.stringify({
      timestamp,
      level: 'INFO',
      context,
      message,
      data: maskedData
    }));
  },

  warn: (message: string, data: Record<string, any> = {}, context: string = 'general') => {
    const timestamp = new Date().toISOString();
    const maskedData = authLogger.maskSensitiveData(data);
    console.warn(JSON.stringify({
      timestamp,
      level: 'WARN',
      context,
      message,
      data: maskedData
    }));
  },

  error: (message: string, error: any, data: Record<string, any> = {}, context: string = 'general') => {
    const timestamp = new Date().toISOString();
    const maskedData = authLogger.maskSensitiveData(data);
    console.error(JSON.stringify({
      timestamp,
      level: 'ERROR',
      context,
      message,
      error: {
        message: error.message || error,
        stack: error.stack,
        code: error.code,
      },
      data: maskedData
    }));
  },

  security: (message: string, data: Record<string, any> = {}, context: string = 'security') => {
    const timestamp = new Date().toISOString();
    const maskedData = authLogger.maskSensitiveData(data);
    console.log(JSON.stringify({
      timestamp,
      level: 'SECURITY',
      context,
      message,
      data: maskedData
    }));
  },

  audit: (message: string, data: Record<string, any> = {}, userId?: number) => {
    const timestamp = new Date().toISOString();
    const maskedData = authLogger.maskSensitiveData(data);
    console.log(JSON.stringify({
      timestamp,
      level: 'AUDIT',
      context: 'user_activity',
      message,
      userId,
      data: maskedData
    }));
  }
};
import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type User as SelectUser } from "@db/schema";
import { db, pool } from "../db";
import { eq, or } from "drizzle-orm";
import { z } from "zod";

const scryptAsync = promisify(scrypt);
const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    const [hashedPassword, salt] = storedPassword.split(".");
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(
      suppliedPassword,
      salt,
      64
    )) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

// extend express user object with our schema
declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

// Enhanced validation schema for registration
const registrationSchema = z.object({
  email: z.string()
    .email("Please enter a valid email address")
    .min(5, "Email is too short")
    .max(255, "Email must not exceed 255 characters"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
});

// Password reset validation schemas
const requestResetSchema = z.object({
  email: z.string().email("Please enter a valid email address")
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
});

// Profile update validation schema
const profileUpdateSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  bio: z.string().max(1000).optional(),
  avatarUrl: z.string().url().max(512).optional(),
});

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "porygon-supremacy",
    resave: false,
    saveUninitialized: false,
    cookie: {},
    store: new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie = {
      secure: true,
    };
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          return done(null, false, { message: "Invalid email or password" });
        }
        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Invalid email or password" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      authLogger.info('Registration attempt started', { ip: req.ip }, 'registration');
      
      const result = registrationSchema.safeParse(req.body);
      if (!result.success) {
        const validationErrors = result.error.errors.map(err => ({
          field: err.path[0],
          message: err.message
        }));
        authLogger.warn('Registration validation failed', { 
          errors: validationErrors,
          ip: req.ip 
        }, 'registration');
        return res
          .status(400)
          .json({ 
            error: "Validation failed", 
            details: validationErrors
          });
      }

      const { email, password } = result.data;

      // Use Drizzle transaction
      const newUser = await db.transaction(async (tx) => {
        // Check if user already exists
        const existingUser = await tx
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUser.length > 0) {
          authLogger.security('Registration attempt with existing email', { 
            email,
            ip: req.ip 
          }, 'registration');
          throw new Error("Email is already registered");
        }

        // Hash the password
        const hashedPassword = await crypto.hash(password);

        // Create the new user using Drizzle
        const [insertedUser] = await tx
          .insert(users)
          .values({
            email,
            password: hashedPassword,
            provider: 'local',
            emailVerified: false,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();

        return insertedUser;
      });

      authLogger.info('User created successfully', { 
        userId: newUser.id,
        email: newUser.email,
        ip: req.ip 
      }, 'registration');

      // Log the user in after registration
      req.login(newUser, (err) => {
        if (err) {
          authLogger.error('Auto-login after registration failed', err, {
            userId: newUser.id,
            ip: req.ip
          }, 'registration');
          return next(err);
        }
        authLogger.audit('User registered and logged in', {
          ip: req.ip,
          provider: 'local'
        }, newUser.id);
        return res.json({
          message: "Registration successful",
          user: { id: newUser.id, email: newUser.email },
        });
      });
    } catch (error) {
      // Type assertion for known error types
      if (error instanceof Error && error.message === "Email is already registered") {
        authLogger.error('Registration process failed', error, {
          ip: req.ip,
          reason: 'duplicate_email'
        }, 'registration');
        return res.status(400).json({ error: error.message });
      }

      // Handle unknown errors
      const err = error instanceof Error ? error : new Error('Unknown registration error');
      authLogger.error('Registration process failed', err, {
        ip: req.ip
      }, 'registration');
      
      next(err);
    }
  });

  // Password reset request endpoint
  app.post("/api/request-password-reset", async (req, res) => {
    try {
      authLogger.info('Password reset request initiated', { 
        ip: req.ip,
        userAgent: req.headers['user-agent'] 
      }, 'password_reset');

      const result = requestResetSchema.safeParse(req.body);
      if (!result.success) {
        const validationErrors = result.error.errors.map(err => ({
          field: err.path[0],
          message: err.message
        }));
        authLogger.warn('Password reset validation failed', {
          errors: validationErrors,
          ip: req.ip
        }, 'password_reset');
        return res.status(400).json({ 
          error: "Validation failed",
          details: validationErrors
        });
      }

      const { email } = result.data;
      
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        // Don't reveal whether a user exists
        authLogger.security('Password reset requested for non-existent email', {
          email,
          ip: req.ip
        }, 'password_reset');
        return res.json({ message: "If an account exists, a password reset link will be sent" });
      }

      // Generate reset token
      const resetToken = randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

      authLogger.info('Reset token generated', {
        userId: user.id,
        tokenExpiry: resetTokenExpiry,
        ip: req.ip
      }, 'password_reset');

      // Update user with reset token
      await db
        .update(users)
        .set({
          resetToken,
          resetTokenExpiry
        })
        .where(eq(users.id, user.id));

      authLogger.audit('Password reset token created', {
        userId: user.id,
        ip: req.ip,
        tokenExpiry: resetTokenExpiry
      });

      // TODO: Send email with reset token
      // For now, we'll just return the token in the response (only for development)
      res.json({ 
        message: "If an account exists, a password reset link will be sent",
        token: process.env.NODE_ENV === 'development' ? resetToken : undefined 
      });
    } catch (error) {
      authLogger.error('Failed to process password reset request', error, {
        ip: req.ip
      }, 'password_reset');
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  });

  // Reset password endpoint
  app.post("/api/reset-password", async (req, res) => {
    try {
      authLogger.info('Password reset attempt started', { 
        ip: req.ip,
        userAgent: req.headers['user-agent']
      }, 'password_reset');

      const result = resetPasswordSchema.safeParse(req.body);
      if (!result.success) {
        const validationErrors = result.error.errors.map(err => ({
          field: err.path[0],
          message: err.message
        }));
        authLogger.warn('Password reset validation failed', {
          errors: validationErrors,
          ip: req.ip
        }, 'password_reset');
        return res.status(400).json({ 
          error: "Validation failed",
          details: validationErrors
        });
      }

      const { token, password } = result.data;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.resetToken, token))
        .limit(1);

      if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
        authLogger.security('Invalid or expired reset token used', {
          ip: req.ip,
          tokenExpired: user?.resetTokenExpiry ? user.resetTokenExpiry < new Date() : false
        }, 'password_reset');
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      authLogger.info('Valid reset token provided', {
        userId: user.id,
        ip: req.ip
      }, 'password_reset');

      // Hash the new password
      const hashedPassword = await crypto.hash(password);
      
      authLogger.info('New password hashed successfully', {
        userId: user.id,
        ip: req.ip
      }, 'password_reset');

      // Update user's password and clear reset token
      await db
        .update(users)
        .set({
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null
        })
        .where(eq(users.id, user.id));

      authLogger.audit('Password reset completed', {
        userId: user.id,
        ip: req.ip,
        resetTokenCleared: true
      });

      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      authLogger.error('Failed to reset password', error, {
        ip: req.ip
      }, 'password_reset');
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    authLogger.info('Login attempt started', { 
      ip: req.ip,
      userAgent: req.headers['user-agent']
    }, 'login');

    const result = insertUserSchema.safeParse(req.body);
    if (!result.success) {
      const validationErrors = result.error.errors.map(err => ({
        field: err.path[0],
        message: err.message
      }));
      authLogger.warn('Login validation failed', {
        errors: validationErrors,
        ip: req.ip
      }, 'login');
      return res.status(400).json({
        error: "Invalid input",
        details: validationErrors
      });
    }

    const cb = (err: any, user: Express.User, info: IVerifyOptions) => {
      if (err) {
        authLogger.error('Login authentication error', err, {
          ip: req.ip
        }, 'login');
        return next(err);
      }

      if (!user) {
        authLogger.security('Failed login attempt', {
          email: req.body.email,
          reason: info.message,
          ip: req.ip
        }, 'login');
        return res.status(400).json({ error: info.message ?? "Login failed" });
      }

      req.logIn(user, (err) => {
        if (err) {
          authLogger.error('Session creation failed', err, {
            userId: user.id,
            ip: req.ip
          }, 'login');
          return next(err);
        }

        authLogger.audit('User logged in', {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          provider: 'local'
        }, user.id);

        return res.json({
          message: "Login successful",
          user: { id: user.id, email: user.email },
        });
      });
    };
    passport.authenticate("local", cb)(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    authLogger.info('Logout initiated', {
      userId,
      email: userEmail,
      ip: req.ip
    }, 'logout');

    req.logout((err) => {
      if (err) {
        authLogger.error('Logout failed', err, {
          userId,
          ip: req.ip
        }, 'logout');
        return res.status(500).json({ error: "Logout failed" });
      }

      authLogger.audit('User logged out', {
        ip: req.ip,
        sessionDestroyed: true
      }, userId);

      res.json({ message: "Logout successful" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      return res.json(req.user);
    }

    res.status(401).json({ error: "Not logged in" });
  });

  app.put("/api/profile", async (req, res) => {
    if (!req.isAuthenticated()) {
      authLogger.security('Unauthorized profile update attempt', {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      }, 'profile_update');
      return res.status(401).json({ error: "Not logged in" });
    }

    try {
      authLogger.info('Profile update initiated', {
        userId: req.user.id,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      }, 'profile_update');

      const result = profileUpdateSchema.safeParse(req.body);
      if (!result.success) {
        const validationErrors = result.error.errors.map(err => ({
          field: err.path[0],
          message: err.message
        }));
        authLogger.warn('Profile update validation failed', {
          userId: req.user.id,
          errors: validationErrors,
          ip: req.ip
        }, 'profile_update');
        return res.status(400).json({
          error: "Validation failed",
          details: validationErrors
        });
      }

      const [updatedUser] = await db
        .update(users)
        .set(result.data)
        .where(eq(users.id, req.user.id))
        .returning();

      authLogger.audit('Profile updated successfully', {
        userId: req.user.id,
        ip: req.ip,
        updatedFields: Object.keys(result.data)
      });

      res.json({
        message: "Profile updated successfully",
        user: updatedUser
      });
    } catch (error) {
      authLogger.error('Failed to update profile', error, {
        userId: req.user.id,
        ip: req.ip
      }, 'profile_update');
      res.status(500).json({ error: "Failed to update profile" });
    }
  });
  // Delete account endpoint
  app.delete("/api/account", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not logged in" });
    }

    try {
      // Delete the user and associated data
      await db.delete(users).where(eq(users.id, req.user.id));

      // Logout the user after deletion
      req.logout((err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to logout after account deletion" });
        }
        res.json({ message: "Account deleted successfully" });
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete account" });
    }
  });
}
