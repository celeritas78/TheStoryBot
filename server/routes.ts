import express from 'express';
import fs from 'fs';
import path from 'path';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { stories, storySegments, users } from '../db/schema';
import type { Request, Response } from 'express';
import multer from 'multer';
import { saveImageFile } from './services/image-storage';
import bcrypt from 'bcryptjs';
import { 
  generateStoryContent, 
  generateImage, 
  generateSpeech 
} from './services/openai';
import { sendErrorResponse } from './utils/error';
import { 
  getAudioFilePath, 
  audioFileExists, 
  isAudioFormatSupported,
  SUPPORTED_AUDIO_FORMATS,
  getMimeType 
} from './services/audio-storage';
import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});
import { 
  getImageFilePath, 
  imageFileExists, 
  isImageFormatSupported, 
  SUPPORTED_IMAGE_FORMATS,
  getMimeType as getImageMimeType 
} from './services/image-storage';
import { MAX_STORIES } from './config';

const registrationSchema = z.object({
  email: z.string().email("Invalid email").max(255, "Email too long"),
  password: z.string().min(8, "Password too short").max(255, "Password too long"),
  displayName: z.string().min(2, "Display name too short").max(255, "Display name too long"),
});

export function setupRoutes(app: express.Application) {
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
        .where(eq(users.id, userId))
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
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

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
        where: eq(stories.userId, userId),
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

  // Create payment intent endpoint
  app.post('/api/create-payment-intent', async (req, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Not logged in" });
      }

      const { credits, amount, customer } = req.body;
      
      if (!credits || credits < 1 || credits > 100) {
        return res.status(400).json({ error: "Invalid credit amount" });
      }

      if (!customer || !customer.name || !customer.line1 || !customer.city || 
          !customer.state || !customer.postal_code || !customer.country) {
        return res.status(400).json({ error: "Customer details are required for export transactions" });
      }

      // Ensure we have the user ID
      const userId = req.user?.id;
      if (!userId) {
        console.error('Create payment intent - User ID missing:', {
          session: req.session,
          user: req.user,
          timestamp: new Date().toISOString()
        });
        return res.status(401).json({ error: 'User ID not found in session' });
      }

      // Create payment intent with better logging
      console.log('Creating payment intent with metadata:', {
        userId,
        credits,
        amount,
        timestamp: new Date().toISOString()
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount, // Amount in cents
        currency: 'usd',
        description: `Purchase of ${credits} story generation credits`,
        statement_descriptor: 'STORYBOT CREDITS',
        metadata: {
          userId: userId.toString(), // Ensure userId is a string
          credits: credits.toString(), // Ensure credits is a string
          timestamp: new Date().toISOString(),
        },
        shipping: {
          name: customer.name,
          address: {
            line1: customer.line1,
            city: customer.city,
            state: customer.state,
            postal_code: customer.postal_code,
            country: customer.country,
          },
        },
      });

      console.log('Payment intent created:', {
        id: paymentIntent.id,
        clientSecret: !!paymentIntent.client_secret,
        metadata: paymentIntent.metadata,
        timestamp: new Date().toISOString()
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
      });
    } catch (error) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ error: 'Failed to create payment' });
    }
  });

  // Stripe webhook endpoint
  app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    console.log('Stripe webhook received:', {
      hasSignature: !!sig,
      hasSecret: !!webhookSecret,
      bodyType: typeof req.body,
      isBuffer: Buffer.isBuffer(req.body),
      headers: req.headers,
      bodyLength: req.body?.length,
      timestamp: new Date().toISOString()
    });

    if (!webhookSecret || !sig) {
      console.error('Webhook configuration error:', {
        hasSecret: !!webhookSecret,
        hasSignature: !!sig,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ 
        error: !webhookSecret ? 'Missing webhook secret' : 'Missing signature',
        details: 'Please ensure webhook is properly configured'
      });
    }

    let event: Stripe.Event;
    
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      console.log('Webhook signature verified successfully:', {
        eventType: event.type,
        eventId: event.id,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Webhook signature verification failed:', {
        error: err instanceof Error ? err.message : 'Unknown error',
        signature: sig,
        rawBody: req.body?.toString(),
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({
        error: 'Webhook signature verification failed',
        details: err instanceof Error ? err.message : 'Unknown error'
      });
    }

    // Log full event data for debugging
    console.log('Webhook event details:', {
      type: event.type,
      id: event.id,
      object: event.data.object,
      created: event.created,
      timestamp: new Date().toISOString(),
      rawEvent: JSON.stringify(event)
    });

    // Handle payment success
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { userId, credits } = paymentIntent.metadata || {};

      console.log('Processing payment success:', {
        paymentIntentId: paymentIntent.id,
        userId,
        credits,
        amount: paymentIntent.amount,
        metadata: paymentIntent.metadata,
        rawPaymentIntent: JSON.stringify(paymentIntent),
        timestamp: new Date().toISOString()
      });

      if (!userId || !credits) {
        console.error('Missing payment metadata:', {
          metadata: paymentIntent.metadata,
          paymentIntentId: paymentIntent.id,
          rawPaymentIntent: JSON.stringify(paymentIntent),
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ 
          error: 'Invalid payment metadata',
          details: 'Missing userId or credits in payment metadata'
        });
      }

      const userIdNum = Number(userId);
      const creditsNum = Number(credits);

      console.log('Parsed payment metadata:', {
        originalUserId: userId,
        originalCredits: credits,
        parsedUserId: userIdNum,
        parsedCredits: creditsNum,
        isUserIdValid: !isNaN(userIdNum),
        isCreditsValid: !isNaN(creditsNum),
        timestamp: new Date().toISOString()
      });

      if (isNaN(userIdNum) || isNaN(creditsNum)) {
        console.error('Invalid metadata values:', {
          userId,
          credits,
          userIdNum,
          creditsNum,
          paymentIntentId: paymentIntent.id,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ 
          error: 'Invalid payment metadata',
          details: 'userId or credits are not valid numbers'
        });
      }

      // Log the payment intent ID to track duplicates
      console.log('Starting credit update transaction:', {
        paymentIntentId: paymentIntent.id,
        userId: userIdNum,
        credits: creditsNum,
        timestamp: new Date().toISOString()
      });

      try {
        // Implement idempotency check
        const idempotencyKey = `payment_${paymentIntent.id}`;
        console.log('Starting database transaction:', {
          idempotencyKey,
          paymentIntentId: paymentIntent.id,
          timestamp: new Date().toISOString()
        });

        const result = await db.transaction(async (tx) => {
          console.log('Fetching user data with lock:', {
            userId: userIdNum,
            timestamp: new Date().toISOString()
          });

          // Get current user data with row lock
          const [user] = await tx
            .select()
            .from(users)
            .where(eq(users.id, userIdNum))
            .limit(1)
            .for('update');

          console.log('User data retrieved:', {
            userId: userIdNum,
            userFound: !!user,
            currentCredits: user?.storyCredits,
            timestamp: new Date().toISOString()
          });

          if (!user) {
            throw new Error(`User ${userIdNum} not found`);
          }

          const currentCredits = user.storyCredits || 0;
          const newTotal = currentCredits + creditsNum;

          console.log('Calculating new credit total:', {
            userId: userIdNum,
            currentCredits,
            addingCredits: creditsNum,
            newTotal,
            idempotencyKey,
            timestamp: new Date().toISOString()
          });

          // Update credits
          console.log('Executing update query:', {
            userId: userIdNum,
            newTotal,
            timestamp: new Date().toISOString()
          });

          const [updatedUser] = await tx
            .update(users)
            .set({
              storyCredits: newTotal,
              updatedAt: new Date()
            })
            .where(eq(users.id, userIdNum))
            .returning();

          console.log('Update query completed:', {
            success: !!updatedUser,
            newCredits: updatedUser?.storyCredits,
            timestamp: new Date().toISOString()
          });

          if (!updatedUser) {
            throw new Error('Failed to update user credits');
          }

          return updatedUser;
        });

        console.log('Transaction completed successfully:', {
          userId: result.id,
          newTotal: result.storyCredits,
          paymentIntentId: paymentIntent.id,
          timestamp: new Date().toISOString()
        });

        return res.json({
          received: true,
          type: event.type,
          credits: result.storyCredits
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to update credits:', {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
          userId: userIdNum,
          credits: creditsNum,
          paymentIntentId: paymentIntent.id,
          timestamp: new Date().toISOString()
        });
        
        return res.status(500).json({
          error: 'Failed to process payment',
          details: 'Error updating credits. Please contact support if credits are not reflected.'
        });
      }
    }

    // Acknowledge receipt of the event
    res.json({ received: true, type: event.type });
  });
}