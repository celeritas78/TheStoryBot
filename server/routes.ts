import express from 'express';
import fs from 'fs';
import { z } from 'zod';
import { db } from '../db';
import { stories, storySegments, users } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
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
      }).returning();

      res.status(201).json({ message: "Registration successful", user: { id: newUser.id, email: newUser.email, displayName: newUser.displayName } });
    } catch (err) {
      console.error("Error registering user:", err);
      res.status(500).json({ error: "Internal server error" });
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

      console.log('Story generation request:', {
        userId,
        childName,
        childAge,
        mainCharacter,
        theme,
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
          const fullSceneDescription = `${scene.description}\nCharacters and Objects from the Story:\n${characterDescriptions}\nSettings and Events from the Story:\n${settingDescriptions}`;

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

      // Save story to the database, including the userId
      const [story] = await db.insert(stories)
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

      if (!story || !story.id) {
        throw new Error("Failed to create story record");
      }

      // Insert all story segments
      const insertedSegments = await db.insert(storySegments)
        .values(segments.map(segment => ({
          storyId: story.id,
          content: segment.content,
          imageUrl: segment.imageUrl,
          audioUrl: segment.audioUrl,
          sequence: segment.sequence,
        })))
        .returning();

      console.log('Successfully created story segments:', {
        storyId: story.id,
        segmentCount: insertedSegments.length,
        timestamp: new Date().toISOString()
      });

      res.json({
        id: story.id,
        userId, 
        childName: story.childName,
        theme: story.theme,
        segments: insertedSegments,
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