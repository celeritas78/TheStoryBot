import express from 'express';
import fs from 'fs';
import { z } from 'zod';
import { db } from '../db';
import { stories, storySegments, users, creditTransactions } from '../db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import type { Request, Response } from 'express';
import multer from 'multer';
import { saveImageFile } from './services/image-storage';
import { createPaymentIntent, confirmPaymentIntent } from './services/stripe';
import bcrypt from 'bcryptjs';
import { 
  MAX_FREE_STORIES,
  PLANS,
} from './config';

interface UserWithStoryCount {
  credits: number;
  isPremium: boolean;
  totalStories: number;
  message?: string;
}

interface SubscriptionCheckResponse {
  error?: string;
  creditsNeeded: boolean;
  currentCredits: number;
  isPremium: boolean;
  maxFreeStories: number;
  upgradeToPremium: boolean;
}
import { 
  generateStoryContent, 
  generateImage, 
  generateSpeech 
} from './services/openai';
import { sendErrorResponse } from './utils/error';
import { subscriptionService } from './services/subscription';
import { 
  CREDITS_PER_USD, 
  MAX_CREDITS_PURCHASE, 
  MIN_CREDITS_PURCHASE,
  FREE_CREDITS,
  STRIPE_CURRENCY,
  STRIPE_PAYMENT_MODE,
  STRIPE_STATEMENT_DESCRIPTOR,
  STRIPE_STATEMENT_DESCRIPTOR_SUFFIX
} from './config';
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
      // Accept only images
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });

  // Custom error handling for multer
  const handleMulterError = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File too large',
          details: 'Maximum file size is 10MB'
        });
      }
    }
    next(err);
  };

  // Handle child photo upload
  app.post('/api/profile/child-photo', upload.single('photo'), handleMulterError, async (req: express.Request, res: express.Response) => {
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

      // Save the image using our image storage service
      const childPhotoUrl = await saveImageFile(fileBuffer, fileType, {
        maxSizeMB: 5,
        quality: 80
      });

      console.log('Updating user record:', {
        userId,
        childPhotoUrl,
        timestamp: new Date().toISOString()
      });

      // Update user record with new photo URL and get updated user
      const [updatedUser] = await db
        .update(users)
        .set({ 
          childPhotoUrl,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        console.error('Failed to update user record:', {
          userId,
          childPhotoUrl,
          timestamp: new Date().toISOString()
        });
        throw new Error('Failed to update user record');
      }

      console.log('User record updated successfully:', {
        userId,
        childPhotoUrl: updatedUser.childPhotoUrl,
        timestamp: new Date().toISOString()
      });

      // Return the full updated user object (excluding password)
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

  // Serve image files with proper CORS and caching headers
  app.get("/images/:filename", async (req: express.Request, res: express.Response) => {
    try {
      const { filename } = req.params;
      const requestId = Math.random().toString(36).substring(7);
      
      console.log('Image request received:', { 
        requestId,
        filename,
        timestamp: new Date().toISOString(),
        headers: req.headers
      });

      // Validate filename format and check supported formats
      if (!filename.match(/^[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp)$/)) {
        console.error('Invalid filename format:', { requestId, filename });
        return res.status(400).json({ error: "Invalid image filename format" });
      }

      if (!isImageFormatSupported(filename)) {
        console.error('Unsupported image format:', { requestId, filename });
        return res.status(400).json({ error: "Unsupported image format" });
      }

      // Check if the client already has a cached version
      const ifNoneMatch = req.headers['if-none-match'];

      // Check image existence in database
      const imagePath = `/images/${filename}`;
      const [segment, user] = await Promise.all([
        db.query.storySegments.findFirst({
          where: eq(storySegments.imageUrl, imagePath)
        }),
        db.query.users.findFirst({
          where: eq(users.childPhotoUrl, imagePath)
        })
      ]);

      console.log('Image lookup result:', {
        filename,
        foundInStorySegments: !!segment,
        foundInUserProfile: !!user,
        timestamp: new Date().toISOString()
      });

      if (!segment && !user) {
        console.error('Image not found in database:', { 
          filename,
          timestamp: new Date().toISOString()
        });
        return res.status(404).json({ error: "Image not found" });
      }

      const filePath = getImageFilePath(filename);
      
      try {
        if (!fs.existsSync(filePath)) {
          console.error('Image file not found on disk:', { 
            requestId,
            filePath,
            timestamp: new Date().toISOString()
          });
          return res.status(404).json({ error: "Image file not found" });
        }
        
        await fs.promises.access(filePath, fs.constants.R_OK);
      } catch (error) {
        console.error('Error accessing image file:', { 
          requestId,
          filePath,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
        return res.status(500).json({ error: "Error accessing image file" });
      }

      // Get file stats for headers and caching
      const stat = fs.statSync(filePath);
      const etag = `"${stat.size}-${stat.mtime.getTime()}"`;

      // If client has a cached version and it matches, return 304
      if (ifNoneMatch && ifNoneMatch === etag) {
        console.log('Client has current version:', { requestId, etag });
        return res.status(304).end();
      }

      console.log('Image file stats:', { 
        requestId,
        size: stat.size,
        path: filePath,
        etag,
        exists: true,
        timestamp: new Date().toISOString()
      });

      // Set cache control headers
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', stat.mtime.toUTCString());

      // Handle range requests for large images
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        const stream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': getImageMimeType(filename),
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD',
          'Access-Control-Allow-Headers': 'Range',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Etag': `"${stat.size}-${stat.mtime.getTime()}"`,
          'Last-Modified': stat.mtime.toUTCString()
        });

        stream.pipe(res);
      } else {
        // Set proper CORS and caching headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
        res.setHeader('Access-Control-Allow-Headers', 'Range');
        res.setHeader('Content-Type', getImageMimeType(filename));
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Etag', `"${stat.size}-${stat.mtime.getTime()}"`);
        res.setHeader('Last-Modified', stat.mtime.toUTCString());

        // Stream the image file with error handling
        const stream = fs.createReadStream(filePath);
        stream.on('error', (error) => {
          console.error('Stream error:', {
            error,
            filename,
            timestamp: new Date().toISOString()
          });
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream image file' });
          }
        });

        stream.pipe(res);
      }
    } catch (error: any) {
      console.error('Error serving image:', { 
        error, 
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to serve image file' });
      }
    }
  });

  // Serve audio files with proper CORS and caching headers
  app.get("/audio/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      console.log('Audio request received:', { filename });

      // First check if this audio file is referenced in the database
      const segment = await db.query.storySegments.findFirst({
        where: eq(storySegments.audioUrl, `/audio/${filename}`)
      });

      if (!segment) {
        console.error('Audio file not found in database:', { filename });
        return res.status(404).json({ error: "Audio file not found" });
      }

      const filePath = getAudioFilePath(filename);
      console.log('Resolved file path:', { filePath });

      if (!fs.existsSync(filePath)) {
        console.error('Audio file not found on disk:', { filePath });
        return res.status(404).json({ error: "Audio file not found" });
      }

      // Log file stats
      const stat = fs.statSync(filePath);
      console.log('Audio file stats:', { 
        size: stat.size,
        path: filePath,
        exists: fs.existsSync(filePath)
      });

      // Handle range requests
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        const stream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': getMimeType(filename),
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD',
          'Access-Control-Allow-Headers': 'Range',
          'Cache-Control': 'public, max-age=31536000'
        });

        stream.pipe(res);
      } else {
        // Set proper CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
        res.setHeader('Access-Control-Allow-Headers', 'Range');
        
        // Set content type and caching headers
        res.setHeader('Content-Type', getMimeType(filename));
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'public, max-age=31536000');

        // Stream the audio file
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      }
    } catch (error: any) {
      console.error('Error serving audio:', { 
        error, 
        message: error.message,
        stack: error.stack 
      });
      res.status(500).json({ error: 'Failed to serve audio file' });
    }
  });

  // Global error middleware (from original code)
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Global error handler:', {
      error: err,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
    
    // Ensure response hasn't been sent yet
    if (res.headersSent) {
      return next(err);
    }

    // Set JSON content type
    res.setHeader('Content-Type', 'application/json');
    
    // Handle different types of errors
    if (err.type === 'entity.parse.failed') {
      return sendErrorResponse(res, 400, 'Invalid JSON payload', err.message);
    }
    
    return sendErrorResponse(res, err.status || 500, err.message || 'Internal server error', 
      process.env.NODE_ENV === 'development' ? err.stack : undefined);
  });

  app.post("/api/register", async (req, res) => { 
    try {
      const result = registrationSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Validation failed", details: result.error.errors });
      }

      const { email, password, displayName } = result.data;

      // Check if the user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existingUser) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Hash password and insert the user
      const hashedPassword = await bcrypt.hash(password, 10);
      const [newUser] = await db.insert(users).values({
        email,
        password: hashedPassword,
        displayName, 
        createdAt: new Date(),
        storyCredits: FREE_CREDITS, // Give free credits to new users
      }).returning();

      res.status(201).json({ 
        message: "Registration successful", 
        user: { 
          id: newUser.id, 
          email: newUser.email, 
          displayName: newUser.displayName, 
          storyCredits: FREE_CREDITS 
        } 
      });
    } catch (err) {
      console.error("Error registering user:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Credit management endpoints
  app.post("/api/credits/purchase", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        console.log('Unauthorized credit purchase attempt');
        return res.status(401).json({ error: "Not logged in" });
      }

      const { amount } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        console.error('User ID missing in authenticated request');
        return res.status(401).json({ error: "Invalid user session" });
      }

      console.log('Credit purchase request:', {
        userId,
        requestedAmount: amount,
        timestamp: new Date().toISOString()
      });

      // Validate amount
      if (!amount || amount < MIN_CREDITS_PURCHASE || amount > MAX_CREDITS_PURCHASE) {
        console.log('Invalid credit purchase amount:', {
          userId,
          amount,
          min: MIN_CREDITS_PURCHASE,
          max: MAX_CREDITS_PURCHASE,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ 
          error: `Amount must be between ${MIN_CREDITS_PURCHASE} and ${MAX_CREDITS_PURCHASE} credits` 
        });
      }

      // Create Stripe payment intent
      const paymentResponse = await createPaymentIntent({
        amount, // Amount in USD
        userId,
        description: `Purchase ${amount} story credits`,
        receiptEmail: req.user?.email
      });

      console.log('Stripe payment intent created:', {
        userId,
        amount,
        paymentIntentId: paymentResponse.paymentIntentId,
        status: paymentResponse.status,
        timestamp: new Date().toISOString()
      });

      // Create pending transaction
      const [transaction] = await db.insert(creditTransactions)
        .values({
          userId,
          amount: paymentResponse.amount, // Amount in cents from Stripe
          credits: amount * CREDITS_PER_USD,
          status: 'pending',
          stripePaymentId: paymentResponse.paymentIntentId,
          createdAt: new Date(),
        })
        .returning();

      if (!transaction) {
        console.error('Failed to create credit transaction:', {
          userId,
          amount,
          paymentIntentId: paymentResponse.paymentIntentId,
          timestamp: new Date().toISOString()
        });
        throw new Error('Failed to create credit transaction');
      }

      console.log('Credit transaction created:', {
        userId,
        transactionId: transaction.id,
        amount,
        status: 'pending',
        timestamp: new Date().toISOString()
      });

      const { clientSecret } = paymentResponse;
      res.json({
        clientSecret,
        transactionId: transaction.id,
        amount: paymentResponse.amount,
        currency: paymentResponse.currency
      });
    } catch (error) {
      console.error('Error creating payment intent:', {
        error,
        userId: req.user?.id,
        amount: req.body.amount,
        timestamp: new Date().toISOString(),
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({ error: 'Failed to create payment intent' });
    }
  });

  app.post("/api/credits/confirm", async (req, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        console.log('Unauthorized payment confirmation attempt');
        return res.status(401).json({ error: "Not logged in" });
      }

      const { paymentIntentId } = req.body;
      const userId = req.user?.id;

      console.log('Payment confirmation request:', {
        userId,
        paymentIntentId,
        timestamp: new Date().toISOString()
      });

      // Confirm payment with Stripe
      const isSuccessful = await confirmPaymentIntent(paymentIntentId);

      if (!isSuccessful) {
        console.log('Payment confirmation failed:', {
          userId,
          paymentIntentId,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ error: "Payment failed" });
      }

      // Update transaction and user credits within a transaction
      const result = await db.transaction(async (tx) => {
        // Find the transaction
        const [transaction] = await tx
          .select()
          .from(creditTransactions)
          .where(eq(creditTransactions.stripePaymentId, paymentIntentId))
          .limit(1);

        if (!transaction) {
          console.error('Transaction not found:', {
            userId,
            paymentIntentId,
            timestamp: new Date().toISOString()
          });
          throw new Error("Transaction not found");
        }

        console.log('Found transaction:', {
          transactionId: transaction.id,
          userId,
          credits: transaction.credits,
          timestamp: new Date().toISOString()
        });

        // Update transaction status
        await tx
          .update(creditTransactions)
          .set({ status: 'completed' })
          .where(eq(creditTransactions.id, transaction.id));

        // Update user credits
        const [updatedUser] = await tx
          .update(users)
          .set({
            storyCredits: sql`${users.storyCredits} + ${transaction.credits}`,
            isPremium: true,
          })
          .where(eq(users.id, userId))
          .returning();

        return { transaction, updatedUser };
      });

      console.log('Credit purchase completed:', {
        userId,
        transactionId: result.transaction.id,
        newCreditBalance: result.updatedUser.storyCredits,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        credits: result.updatedUser.storyCredits,
        isPremium: true,
      });
    } catch (error) {
      console.error('Error confirming payment:', {
        error,
        userId: req.user?.id,
        paymentIntentId: req.body.paymentIntentId,
        timestamp: new Date().toISOString(),
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({ error: 'Failed to confirm payment' });
    }
  });

  
      // Get available plans
  app.get("/api/subscription/plans", async (req, res) => {
    try {
      res.json({
        plans: PLANS,
        maxFreeStories: MAX_FREE_STORIES,
        creditsPerUSD: CREDITS_PER_USD
      });
    } catch (error) {
      console.error('Error fetching subscription plans:', error);
      res.status(500).json({ error: 'Failed to fetch subscription plans' });
    }
  });

  // Credit balance endpoint
  app.get("/api/credits/balance", async (req, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Not logged in" });
      }

      const userId = req.user?.id;
      const [user] = await db
        .select({
          credits: users.storyCredits,
          isPremium: users.isPremium,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        credits: user.credits,
        isPremium: user.isPremium,
      });
    } catch (error) {
      console.error('Error fetching credit balance:', error);
      res.status(500).json({ error: 'Failed to fetch credit balance' });
    }
  });

  app.post("/api/stories", async (req, res) => {
    try {
      // Ensure the user is authenticated
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Not logged in" });
      }

      const { childName, childAge, mainCharacter, theme } = req.body;
      const userId = req.user?.id;

      try {
        // Check subscription status and eligibility
        const subscriptionStatus = await subscriptionService.checkStoryCreationEligibility(userId);
        
        console.log('Subscription status check:', {
          userId,
          status: subscriptionStatus,
          timestamp: new Date().toISOString()
        });

        if (!subscriptionStatus.isEligible) {
          const response: SubscriptionCheckResponse = {
            error: subscriptionStatus.message,
            creditsNeeded: subscriptionStatus.currentCredits <= 0,
            currentCredits: subscriptionStatus.currentCredits,
            isPremium: subscriptionStatus.isPremium,
            maxFreeStories: MAX_FREE_STORIES,
            upgradeToPremium: !subscriptionStatus.isPremium && 
              subscriptionStatus.totalStories >= MAX_FREE_STORIES
          };
          return res.status(403).json(response);
        }
      } catch (error) {
        console.error('Error checking subscription status:', error);
        return res.status(500).json({ error: 'Failed to check subscription status' });
      }

      // Check eligibility and get subscription status
      const eligibilityStatus = await subscriptionService.checkStoryCreationEligibility(userId);
      
      console.log('Story generation request:', {
        userId,
        childName,
        childAge,
        mainCharacter,
        theme,
        creditsBeforeDeduction: eligibilityStatus.currentCredits,
        isPremium: eligibilityStatus.isPremium,
        timestamp: new Date().toISOString()
      });

      if (!childName?.trim() || !childAge || !mainCharacter?.trim() || !theme?.trim()) {
        const errorDetails = {
          childName: !childName?.trim() ? "Name is required" : null,
          childAge: !childAge ? "Age is required" : null,
          mainCharacter: !mainCharacter?.trim() ? "Character is required" : null,
          theme: !theme?.trim() ? "Theme is required" : null,
          timestamp: new Date().toISOString()
        };
        console.error('Validation failed:', errorDetails);
        return sendErrorResponse(res, 400, "Missing required fields", errorDetails);
      }

      const parsedAge = Number(childAge);
      if (isNaN(parsedAge)) {
        console.error('Invalid age provided:', childAge);
        return res.status(400).json({ error: "Invalid age format" });
      }

      // Generate initial story content
      const storyContent = await generateStoryContent({
        childName,
        childAge: parsedAge,
        mainCharacter,
        theme,
      });

      const characterDescriptions = storyContent.characters.map(c => `${c.name}: ${c.description}`).join('\n');
      const settingDescriptions = storyContent.settings.map(s => `${s.name}: ${s.description}`).join('\n');

      // Generate media for each scene
      const segments = await Promise.all(storyContent.scenes.map(async (scene, index) => {
        try {
          //const fullSceneDescription = `${scene.description}\nCharacters and Objects from the Story:\n${characterDescriptions}\nSettings and Events from the Story:\n${settingDescriptions}`;
          const fullSceneDescription = `${scene.description}`;

          // Generate image from scene description
          const imageUrl = await generateImage(fullSceneDescription);
          // Generate audio only from the narrative text
          const audioUrl = await generateSpeech(scene.text);

          return {
            content: scene.text, 
            imageUrl,
            audioUrl,
            sequence: index + 1
          };
        } catch (error) {
          console.error(`Failed to generate media for scene ${index + 1}:`, error);
          throw error;
        }
      }));

      // Deduct one credit and save story to the database
      const result = await db.transaction(async (tx) => {
        // Deduct credit using subscription service
        const newCredits = await subscriptionService.deductStoryCredit(userId);
        
        if (newCredits === undefined) {
          console.error('Failed to deduct credit:', {
            userId,
            timestamp: new Date().toISOString()
          });
          throw new Error('Failed to deduct credit');
        }

        console.log('Credit deducted successfully:', {
          userId,
          newBalance: newCredits,
          timestamp: new Date().toISOString()
        });

        // Create story
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

        // Insert all story segments
        const insertedSegments = await tx.insert(storySegments)
          .values(segments.map(segment => ({
            storyId: newStory.id,
            content: segment.content,
            imageUrl: segment.imageUrl,
            audioUrl: segment.audioUrl,
            sequence: segment.sequence,
          })))
          .returning();

        console.log('Successfully created story segments:', {
          storyId: newStory.id,
          segmentCount: insertedSegments.length,
          timestamp: new Date().toISOString()
        });

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

  app.get("/api/stories", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Not logged in" });
      }

      const userId = req.user?.id;
      console.log('Fetching stories for user:', userId);

      const userStories = await db.query.stories.findMany({
        where: eq(stories.userId, userId),
        with: {
          segments: {
            where: eq(storySegments.sequence, 1),
          },
        },
        orderBy: [desc(stories.createdAt)],
      });

      console.log('Stories fetched:', userStories.length);
      res.json(userStories);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ error: "Failed to fetch stories" });
    }
  });

  app.get("/api/stories/:id", async (req, res) => {
    try {
      // Check if user is authenticated
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

      // Check if the story belongs to the requesting user
      if (story.userId !== userId) {
        return res.status(403).json({ error: "You don't have permission to access this story" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ error: "Failed to fetch story" });
    }
  });
}