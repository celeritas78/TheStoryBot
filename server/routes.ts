import express from 'express';
import { eq, desc, sql } from 'drizzle-orm';
import { users, stories, storySegments, creditTransactions } from '../db/schema';
import { db } from '../db';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import { 
  generateStoryContent, 
  generateImage, 
  generateSpeech 
} from './services/ai';
import { sendErrorResponse } from './utils/error';
import type { Request, Response, NextFunction } from 'express';

import { saveImageFile } from './services/image-storage';
import { 
  getAudioFilePath, 
  audioFileExists, 
  isAudioFormatSupported,
  SUPPORTED_AUDIO_FORMATS,
  getMimeType 
} from './services/audio-storage';

import { 
  getImageFilePath, 
  imageFileExists, 
  isImageFormatSupported, 
  SUPPORTED_IMAGE_FORMATS,
  getMimeType as getImageMimeType 
} from './services/image-storage';

// Custom type for Stripe webhook request
interface WebhookRequest extends Request {
  body: any;
  rawBody: Buffer;
}

// Extend the Express Request type
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}
import { MAX_STORIES } from './config';

const registrationSchema = z.object({
  email: z.string().email("Invalid email").max(255, "Email too long"),
  password: z.string().min(8, "Password too short").max(255, "Password too long"),
  displayName: z.string().min(2, "Display name too short").max(255, "Display name too long"),
});

// Type guard for authenticated requests
function isAuthenticated(req: Express.Request): req is Express.Request {
  return req.isAuthenticated();
}

export function setupRoutes(app: express.Application) {
  // Initialize Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2024-12-18.acacia',
  });

  // Stripe webhook handler
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  // Configure raw body handling for Stripe webhook
  const stripeWebhookMiddleware = express.raw({
    type: 'application/json',
    verify: (req: WebhookRequest, _res, buf) => {
      req.rawBody = buf;
      console.log('Raw body captured in middleware:', {
        hasBody: !!buf,
        bodyLength: buf?.length,
        contentType: req.headers['content-type'],
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
      });
    }
  });
  
  // Handle Stripe webhook events
  app.post('/api/stripe-webhook', stripeWebhookMiddleware, async (req: WebhookRequest, res: Response) => {
    let event: Stripe.Event;

    try {
      // Log all incoming request details
      console.log('Stripe webhook request details:', {
        method: req.method,
        path: req.path,
        headers: req.headers,
        timestamp: new Date().toISOString(),
        query: req.query,
        params: req.params
      });

      const rawBody = req.rawBody || req.body;
      console.log('Request body details:', {
        hasBody: !!rawBody,
        bodyType: typeof rawBody,
        isBuffer: Buffer.isBuffer(rawBody),
        bodyLength: rawBody?.length,
        contentType: req.headers['content-type'],
        timestamp: new Date().toISOString()
      });

      if (!Buffer.isBuffer(rawBody)) {
        console.error('Invalid request body format:', {
          bodyType: typeof rawBody,
          isBuffer: Buffer.isBuffer(rawBody),
          contentType: req.headers['content-type'],
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ error: 'Invalid request body format' });
      }

      console.log('Webhook request received:', {
        signature: req.headers['stripe-signature'],
        rawBody: true,
        bodyLength: rawBody.length,
        contentType: req.headers['content-type'],
        timestamp: new Date().toISOString()
      });

      const sig = req.headers['stripe-signature'];
      
      if (!sig || !endpointSecret) {
        console.error('Webhook validation failed:', {
          hasSignature: !!sig,
          hasEndpointSecret: !!endpointSecret,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ error: 'Missing signature or endpoint secret' });
      }

      // Log environment check
      console.log('Webhook environment check:', {
        hasStripeSecret: !!process.env.STRIPE_SECRET_KEY,
        hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      });

      try {
        // Log environment check
        console.log('Webhook environment check:', {
          hasStripeSecret: !!process.env.STRIPE_SECRET_KEY,
          hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
          environment: process.env.NODE_ENV,
          timestamp: new Date().toISOString()
        });

        if (!sig) {
          throw new Error('No Stripe signature found in headers');
        }

        const sigHeader = Array.isArray(sig) ? sig[0] : sig;
        if (!sigHeader) {
          throw new Error('No valid Stripe signature found in headers');
        }

        if (!Buffer.isBuffer(rawBody)) {
          console.error('Invalid request body format:', {
            bodyType: typeof rawBody,
            isBuffer: Buffer.isBuffer(rawBody),
            contentType: req.headers['content-type'],
            timestamp: new Date().toISOString()
          });
          return res.status(400).json({ error: 'Invalid request body format' });
        }

        console.log('Attempting to construct webhook event:', {
          hasSignature: true,
          signatureHeader: sigHeader,
          bodyLength: rawBody.length,
          timestamp: new Date().toISOString()
        });
        
        event = stripe.webhooks.constructEvent(
          rawBody,
          sigHeader,
          endpointSecret as string
        );

        console.log('Webhook event constructed successfully:', {
          eventId: event.id,
          eventType: event.type,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error('Webhook signature verification failed:', {
          error: err instanceof Error ? err.message : 'Unknown error',
          signature: sig,
          bodyLength: rawBody.length,
          webhookSecret: endpointSecret ? 'Present' : 'Missing',
          timestamp: new Date().toISOString()
        });
        throw err;
      }

      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed':
          console.log('Processing checkout.session.completed event:', {
            eventId: event.id,
            timestamp: new Date().toISOString()
          });
          
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id;
          const amountTotal = session.amount_total;
          
          console.log('Session details:', {
            sessionId: session.id,
            userId,
            amountTotal,
            paymentStatus: session.payment_status,
            timestamp: new Date().toISOString()
          });
          
          if (!userId || !amountTotal) {
            const error = new Error('Missing user ID or amount in webhook payload');
            console.error('Invalid webhook payload:', {
              error: error.message,
              userId,
              amountTotal,
              sessionId: session.id,
              timestamp: new Date().toISOString()
            });
            throw error;
          }
          
          console.log('Session details:', {
            sessionId: session.id,
            userId,
            amountTotal,
            paymentStatus: session.payment_status,
            timestamp: new Date().toISOString()
          });
          
          if (!userId || !amountTotal) {
            const error = new Error('Missing user ID or amount in webhook payload');
            console.error('Invalid webhook payload:', {
              error: error.message,
              userId,
              amountTotal,
              sessionId: session.id,
              timestamp: new Date().toISOString()
            });
            throw error;
          }

          // Calculate credits (1 USD = 1 credit)
          const credits = Math.floor(amountTotal / 100); // Convert cents to dollars
          
          console.log('Processing payment completion:', {
            userId,
            credits,
            originalAmount: amountTotal,
            paymentIntent: session.payment_intent,
            customerEmail: session.customer_email,
            paymentStatus: session.payment_status,
            timestamp: new Date().toISOString()
          });

          // Update user credits and record transaction
          try {
            await db.transaction(async (tx) => {
              console.log('Starting credit update transaction:', {
                userId,
                credits,
                amountTotal,
                sessionId: session.id,
                timestamp: new Date().toISOString()
              });

              // Add credits to user
              const [updatedUser] = await tx
                .update(users)
                .set({ 
                  storyCredits: sql`story_credits + ${credits}`,
                  updatedAt: new Date()
                })
                .where(eq(users.id, parseInt(userId)))
                .returning({ storyCredits: users.storyCredits });

              console.log('Credits updated successfully:', {
                userId,
                newCreditBalance: updatedUser.storyCredits,
                addedCredits: credits,
                timestamp: new Date().toISOString()
              });

              // Record the transaction
              const [transaction] = await tx
                .insert(creditTransactions)
                .values({
                  userId: parseInt(userId),
                  amount: amountTotal,
                  credits,
                  status: 'completed',
                  stripePaymentId: session.payment_intent as string,
                  createdAt: new Date()
                })
                .returning();

              console.log('Transaction recorded successfully:', {
                transactionId: transaction.id,
                userId,
                credits,
                stripePaymentId: session.payment_intent,
                timestamp: new Date().toISOString()
              });

              console.log('Transaction recorded:', {
                transactionId: transaction.id,
                userId,
                credits,
                stripePaymentId: session.payment_intent,
                timestamp: new Date().toISOString()
              });
            });
          } catch (error) {
            console.error('Failed to update credits:', {
              error: error instanceof Error ? error.message : 'Unknown error',
              userId,
              credits,
              sessionId: session.id,
              timestamp: new Date().toISOString()
            });
            throw error;
          }
          break;

        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Error processing webhook:', err);
      res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  });
  // Configure multer for handling file uploads
  const upload = multer({
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });

  // Handle child photo upload
  app.post('/api/profile/child-photo', upload.single('photo'), async (req, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Not logged in" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User ID not found in session' });
      }

      const fileBuffer = req.file.buffer;
      const fileType = req.file.mimetype.split('/')[1] || 'jpeg';

      const childPhotoUrl = await saveImageFile(fileBuffer, fileType, {
        maxSizeMB: 5,
        quality: 80
      });

      const [updatedUser] = await db
        .update(users)
        .set({ 
          childPhotoUrl,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId as number))
        .returning();

      if (!updatedUser) {
        throw new Error('Failed to update user record');
      }

      const { password, ...userData } = updatedUser;
      res.json({ 
        childPhotoUrl,
        user: userData 
      });
    } catch (error) {
      console.error('Failed to upload child photo:', error);
      res.status(500).json({ error: 'Failed to upload photo' });
    }
  });

  // Registration endpoint
  app.post("/api/register", async (req, res) => { 
    try {
      const result = registrationSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Validation failed", details: result.error.errors });
      }

      const { email, password, displayName } = result.data;

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existingUser) {
        return res.status(409).json({ error: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [newUser] = await db.insert(users).values({
        email,
        password: hashedPassword,
        displayName,
        storyCredits: 3,
        createdAt: new Date(),
      }).returning();

      res.status(201).json({ 
        message: "Registration successful", 
        user: { 
          id: newUser.id, 
          email: newUser.email, 
          displayName: newUser.displayName
        } 
      });
    } catch (err) {
      console.error("Error registering user:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Story creation endpoint
  app.post("/api/stories", async (req, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Not logged in" });
      }

      const { childName, childAge, mainCharacter, theme } = req.body;
      const userId = req.user?.id;

      // Validate user permission
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user has enough credits
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, userId),
        columns: {
          storyCredits: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.storyCredits <= 0) {
        return res.status(403).json({ error: "No story credits remaining. Please purchase more credits." });
      }

      if (!childName?.trim() || !childAge || !mainCharacter?.trim() || !theme?.trim()) {
        const errorDetails = {
          childName: !childName?.trim() ? "Name is required" : null,
          childAge: !childAge ? "Age is required" : null,
          mainCharacter: !mainCharacter?.trim() ? "Character is required" : null,
          theme: !theme?.trim() ? "Theme is required" : null
        };
        return sendErrorResponse(res, 400, "Missing required fields", errorDetails);
      }

      const parsedAge = Number(childAge);
      if (isNaN(parsedAge)) {
        return res.status(400).json({ error: "Invalid age format" });
      }

      // Generate story content and media
      const storyContent = await generateStoryContent({
        childName,
        childAge: parsedAge,
        mainCharacter,
        theme,
      });

      const characterDescriptions = storyContent.characters.map(c => `${c.name}: ${c.description}`).join('\n');
      const settingDescriptions = storyContent.settings.map(s => `${s.name}: ${s.description}`).join('\n');

      const segments = await Promise.all(storyContent.scenes.map(async (scene, index) => {
        const imageUrl = await generateImage(scene.description);
        const audioUrl = await generateSpeech(scene.text);

        return {
          content: scene.text, 
          imageUrl,
          audioUrl,
          sequence: index + 1
        };
      }));

      // Save story to database
      const result = await db.transaction(async (tx) => {
          // Deduct one credit
          await tx
            .update(users)
            .set({ 
              storyCredits: user.storyCredits - 1,
              updatedAt: new Date()
            })
            .where(eq(users.id, userId));

          const [newStory] = await tx
            .insert(stories)
            .values({
              userId, 
              title: storyContent.title,
              childName,
              childAge: parsedAge,
              characters: JSON.stringify({ mainCharacter }),
              theme,
              content: segments.map(s => s.content).join('\n\n'),
              imageUrls: JSON.stringify(segments.map(s => s.imageUrl)),
              parentApproved: false,
              createdAt: new Date(),
            })
            .returning();

        if (!newStory || !newStory.id) {
          throw new Error("Failed to create story record");
        }

        const insertedSegments = await tx.insert(storySegments)
          .values(segments.map(segment => ({
            storyId: newStory.id,
            content: segment.content,
            imageUrl: segment.imageUrl,
            audioUrl: segment.audioUrl,
            sequence: segment.sequence,
          })))
          .returning();

        return { newStory, insertedSegments };
      });

      res.json({
        id: result.newStory.id,
        userId, 
        childName: result.newStory.childName,
        theme: result.newStory.theme,
        segments: result.insertedSegments,
      });
    } catch (error) {
      console.error('Story generation failed:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      sendErrorResponse(res, 500, "Failed to generate story", {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : 'Unknown'
      });
    }
  });

  // Story continuation endpoint
  app.post("/api/stories/:id/continue", async (req, res) => {
    try {
      const { id } = req.params;

      const story = await db.query.stories.findFirst({
        where: eq(stories.id, parseInt(id)),
      });

      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }

      const characters = JSON.parse(story.characters as string) as { mainCharacter: string };

      const segments = await db.query.storySegments.findMany({
        where: eq(storySegments.storyId, story.id),
        orderBy: (storySegments, { desc }) => [desc(storySegments.sequence)],
      });

      const continuation = await generateStoryContent({
        previousContent: story.content,
        childName: story.childName,
        childAge: story.childAge,
        mainCharacter: characters.mainCharacter,
        theme: story.theme,
      });

      const newSegments = await Promise.all(continuation.scenes.map(async (scene, index) => {
        const imageUrl = await generateImage(scene.description);
        const audioUrl = await generateSpeech(scene.text);
        
        return {
          storyId: story.id,
          content: scene.text,
          imageUrl,
          audioUrl,
          sequence: (segments?.length ?? 0) + index + 1,
        };
      }));

      const insertedSegments = await db.insert(storySegments)
        .values(newSegments)
        .returning();

      res.json({
        segments: insertedSegments,
      });
    } catch (error) {
      console.error("Error continuing story:", error);
      res.status(500).json({ error: "Failed to continue story" });
    }
  });

  // Get all stories endpoint
  app.get("/api/stories", async (req, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Not logged in" });
      }

      const userId = req.user?.id;
      const userStories = await db.query.stories.findMany({
        where: eq(stories.userId, userId as number),
        with: {
          segments: {
            where: eq(storySegments.sequence, 1),
          },
        },
        orderBy: [desc(stories.createdAt)],
      });

      res.json(userStories);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ error: "Failed to fetch stories" });
    }
  });

  // Get single story endpoint
  app.get("/api/stories/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Not logged in" });
      }

      const userId = req.user?.id;
      const story = await db.query.stories.findFirst({
        where: eq(stories.id, parseInt(req.params.id)),
        with: {
          segments: true
        }
      });
      
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }

      if (story.userId !== userId) {
        return res.status(403).json({ error: "You don't have permission to access this story" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ error: "Failed to fetch story" });
    }
  });

  // Image serving endpoint with enhanced headers and logging
  app.get("/images/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      console.log('Image request received:', {
        filename,
        headers: req.headers,
        url: req.url,
        timestamp: new Date().toISOString()
      });
      
      if (!isImageFormatSupported(filename)) {
        return res.status(400).json({ error: "Unsupported image format" });
      }

      const imageDir = path.join(process.cwd(), 'images');
      const filePath = path.join(imageDir, filename);
      
      console.log('Attempting to serve image:', {
        filename,
        filePath,
        exists: fs.existsSync(filePath),
        directoryExists: fs.existsSync(imageDir),
        directoryContents: fs.existsSync(imageDir) ? fs.readdirSync(imageDir) : []
      });

      if (!fs.existsSync(filePath)) {
        console.error('Image file not found:', {
          filename,
          searchPath: filePath,
          timestamp: new Date().toISOString()
        });
        return res.status(404).json({ error: "Image not found" });
      }

      const stat = fs.statSync(filePath);
      const etag = `"${stat.size}-${stat.mtime.getTime()}"`;

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      // Set comprehensive headers for image serving
      res.setHeader('Content-Type', getImageMimeType(filename));
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('ETag', etag);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
      
      console.log('Serving image file:', {
        filename,
        size: stat.size,
        path: filePath,
        mimeType: getImageMimeType(filename),
        timestamp: new Date().toISOString()
      });

      // Stream the file with error handling
      const stream = fs.createReadStream(filePath);
      stream.on('error', (error) => {
        console.error('Stream error:', {
          error: error.message,
          filename,
          timestamp: new Date().toISOString()
        });
        res.status(500).json({ error: 'Failed to stream image file' });
      });
      stream.pipe(res);
      
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error serving image:', error);
      }
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });

  // Audio serving endpoint with enhanced headers and logging
  app.get("/audio/:filename", async (req, res) => {
    const { filename } = req.params;
    try {
      console.log('Audio request received:', {
        filename,
        headers: req.headers,
        url: req.url,
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString()
      });
      
      if (!isAudioFormatSupported(filename)) {
        console.warn('Unsupported audio format attempted:', {
          filename,
          supportedFormats: SUPPORTED_AUDIO_FORMATS,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ error: "Unsupported audio format" });
      }

      const audioDir = path.join(process.cwd(), 'audio');
      const filePath = path.join(audioDir, filename);
      
      // Check if file exists and log directory contents for debugging
      const directoryPath = audioDir;
      const directoryExists = fs.existsSync(directoryPath);
      const fileExists = fs.existsSync(filePath);
      
      console.log('Audio file access check:', {
        filename,
        filePath,
        directoryPath,
        directoryExists,
        fileExists,
        directoryContents: directoryExists ? fs.readdirSync(directoryPath) : [],
        timestamp: new Date().toISOString()
      });

      if (!fileExists) {
        console.error('Audio file not found:', {
          filename,
          searchPath: filePath,
          cwd: process.cwd(),
          timestamp: new Date().toISOString()
        });
        return res.status(404).json({ error: "Audio file not found" });
      }

      const stat = fs.statSync(filePath);
      const mimeType = getMimeType(filename);
      
      // Set comprehensive headers for audio streaming
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
      
      // Set comprehensive headers for audio streaming
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Vary', 'Accept-Encoding');
      
      console.log('Serving audio file:', {
        filename,
        size: stat.size,
        path: filePath,
        mimeType: 'audio/mpeg',
        timestamp: new Date().toISOString()
      });

      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      const errorDetails = {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        requestedFile: filename, // Use the filename from route params
        timestamp: new Date().toISOString()
      };
      console.error('Error serving audio:', errorDetails);
      res.status(500).json({ error: 'Failed to serve audio file', details: errorDetails });
    }
  });

  // Credits info endpoint
  app.get('/api/credits', async (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in session' });
    }

    try {
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, userId),
        columns: {
          storyCredits: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ credits: user.storyCredits });
    } catch (error) {
      console.error('Error fetching credits:', error);
      res.status(500).json({ error: 'Failed to fetch credits' });
    }
  });
}