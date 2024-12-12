import express from 'express';
import fs from 'fs';
import { eq, sql, and, desc } from 'drizzle-orm';
import { crypto } from './auth';
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
import { subscriptionService } from './services/subscription';
// Payment-related imports removed
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

      // Check story creation eligibility
      const eligibilityStatus = await subscriptionService.checkStoryCreationEligibility(userId);
      
      if (!eligibilityStatus.isEligible) {
        return res.status(403).json({
          error: eligibilityStatus.message,
          maxStories: MAX_STORIES
        });
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

  // Image serving endpoint
  app.get("/images/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      
      if (!isImageFormatSupported(filename)) {
        return res.status(400).json({ error: "Unsupported image format" });
      }

      const filePath = getImageFilePath(filename);
      if (!imageFileExists(filePath)) {
        return res.status(404).json({ error: "Image not found" });
      }

      const stat = fs.statSync(filePath);
      const etag = `"${stat.size}-${stat.mtime.getTime()}"`;

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.setHeader('Content-Type', getImageMimeType(filename));
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('ETag', etag);

      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      console.error('Error serving image:', error);
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });

  // Audio serving endpoint
  app.get("/audio/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      
      if (!isAudioFormatSupported(filename)) {
        return res.status(400).json({ error: "Unsupported audio format" });
      }

      const filePath = getAudioFilePath(filename);
      if (!audioFileExists(filePath)) {
        return res.status(404).json({ error: "Audio file not found" });
      }

      const stat = fs.statSync(filePath);
      res.setHeader('Content-Type', getMimeType(filename));
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'public, max-age=31536000');

      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      console.error('Error serving audio:', error);
      res.status(500).json({ error: 'Failed to serve audio file' });
    }
  });
}