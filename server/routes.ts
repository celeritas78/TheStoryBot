import type { Express } from "express";
import { db } from "../db";
import { stories, storySegments, type InsertStorySegment, type Story } from "@db/schema";
import { generateStoryContent, generateImage, generateSpeech } from "./services/openai";
import { eq, desc } from "drizzle-orm";
import fs from 'fs';
import { getAudioFilePath, audioFileExists } from './services/audio-storage';

const MIME_TYPES: Record<string, string> = {
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'm4a': 'audio/mp4',
  'opus': 'audio/opus',
  'aac': 'audio/aac',
  'ogg': 'audio/ogg',
  'webm': 'audio/webm'
};

// Helper function to detect audio format from buffer
function detectAudioFormat(buffer: Buffer): string {
  // Check file signature
  if (buffer.length < 4) return 'mp3'; // Default to mp3 if buffer is too small

  // Check common audio format signatures
  if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return 'mp3';
  if (buffer.toString('ascii', 0, 4) === 'RIFF') return 'wav';
  if (buffer.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (buffer.toString('ascii', 4, 8) === 'ftyp') return 'm4a';

  // Default to mp3 if format cannot be detected
  return 'mp3';
}

// Error response helper function
function sendErrorResponse(res: any, statusCode: number, error: string, details?: any) {
  res.status(statusCode).json({
    error,
    details,
    timestamp: new Date().toISOString()
  });
}

export function registerRoutes(app: Express) {
  // Global error middleware
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
  // Serve audio files with proper CORS and caching headers
  app.get("/audio/:filename", (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = getAudioFilePath(filename);
      
      if (!audioFileExists(filename)) {
        console.error('Audio file not found:', filename);
        return res.status(404).json({ 
          error: "Audio file not found",
          details: { filename },
          timestamp: new Date().toISOString()
        });
      }

      const fileBuffer = fs.readFileSync(filePath);
      const audioFormat = detectAudioFormat(fileBuffer);
      const contentType = MIME_TYPES[audioFormat] || 'audio/mpeg';

      const stat = fs.statSync(filePath);
      const range = req.headers.range;

      console.log('Serving audio file:', {
        filename,
        format: audioFormat,
        contentType,
        size: stat.size,
        hasRange: !!range
      });

      // Handle range requests
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;

        res.status(206);
        res.set({
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache',
        });

        const stream = fs.createReadStream(filePath, { start, end });
        stream.pipe(res);
      } else {
        // Serve full file
        res.set({
          'Content-Length': stat.size,
          'Content-Type': 'audio/mpeg',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (error) {
      console.error('Error serving audio:', error);
      res.status(500).json({ error: 'Failed to serve audio file' });
    }
  });

  app.post("/api/stories", async (req, res) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    console.log(`[${requestId}] Starting story generation request:`, {
      body: req.body,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    try {
      const { childName, childAge, mainCharacter, theme } = req.body;

      // Enhanced validation with detailed error messages
      const validationErrors = {
        childName: !childName?.trim() ? "Child's name is required" : null,
        childAge: !childAge ? "Child's age is required" : 
                 isNaN(Number(childAge)) ? "Age must be a number" : 
                 Number(childAge) < 1 || Number(childAge) > 12 ? "Age must be between 1 and 12" : null,
        mainCharacter: !mainCharacter?.trim() ? "Main character description is required" : null,
        theme: !theme?.trim() ? "Story theme is required" : null
      };

      const hasErrors = Object.values(validationErrors).some(error => error !== null);
      if (hasErrors) {
        console.error(`[${requestId}] Validation failed:`, validationErrors);
        return sendErrorResponse(res, 400, "Invalid story parameters", {
          errors: validationErrors,
          received: { childName, childAge, mainCharacter, theme },
          timestamp: new Date().toISOString(),
          requestId
        });
      }

      console.log(`[${requestId}] Validation passed, proceeding with story generation`);

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

      // Generate media for each scene
      const segments = await Promise.all(storyContent.scenes.map(async (scene, index) => {
        try {
          // Generate image from scene description
          const imageUrl = await generateImage(scene.description);
          // Generate audio only from the narrative text
          const audioUrl = await generateSpeech(scene.text);
          
          return {
            content: scene.text, // Store only the narrative text
            imageUrl,
            audioUrl,
            sequence: index + 1
          };
        } catch (error) {
          console.error(`Failed to generate media for scene ${index + 1}:`, error);
          throw error;
        }
      }));

      // Save to database with better error handling
      const [story] = await db.insert(stories)
        .values({
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
      console.log('Fetching all stories...');
      const allStories = await db.query.stories.findMany({
        with: {
          segments: {
            where: eq(storySegments.sequence, 1),
          },
        },
        orderBy: [desc(stories.createdAt)],
      });

      console.log('Stories fetched:', allStories.length);
      res.json(allStories);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ error: "Failed to fetch stories" });
    }
  });

  app.get("/api/stories/:id", async (req, res) => {
    try {
      const story = await db.query.stories.findFirst({
        where: eq(stories.id, parseInt(req.params.id)),
        with: {
          segments: true
        }
      });
      
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ error: "Failed to fetch story" });
    }
  });
}