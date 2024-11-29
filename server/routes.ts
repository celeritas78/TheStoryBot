import type { Express } from "express";
import { db } from "../db";
import { stories, storySegments, type InsertStorySegment, type Story } from "@db/schema";
import { generateStoryContent, generateImage, generateSpeech } from "./services/openai";
import { eq, desc } from "drizzle-orm";
import fs from 'fs';
import { getAudioFilePath, audioFileExists, getMimeType, isAudioFormatSupported } from './services/audio-storage';

// Audio MIME types configuration
const MIME_TYPES = {
  'wav': 'audio/wav',    // Primary format - Using WAV for best quality and compatibility
} as const;

type SupportedAudioFormat = keyof typeof MIME_TYPES;

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
      
      // Set CORS headers
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Accept-Ranges, Content-Type'
      });

      // Handle preflight request
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }

      // Verify format before proceeding
      if (!isAudioFormatSupported(filename)) {
        return res.status(415).json({ 
          error: "Unsupported audio format",
          supportedFormats: Object.keys(MIME_TYPES)
        });
      }

      if (!audioFileExists(filename)) {
        return res.status(404).json({ error: "Audio file not found" });
      }

      const filePath = getAudioFilePath(filename);
      const stat = fs.statSync(filePath);
      const ext = filename.split('.').pop()?.toLowerCase();
      const mimeType = MIME_TYPES[ext as keyof typeof MIME_TYPES] || 'application/octet-stream';
      const range = req.headers.range;

      // Set common headers
      const commonHeaders = {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      };

      // Handle range requests
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;

        if (isNaN(start) || isNaN(end) || start >= stat.size || end >= stat.size || start > end) {
          res.status(416).json({ error: "Requested range not satisfiable" });
          return;
        }

        res.status(206).set({
          ...commonHeaders,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': chunksize
        });

        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        // Serve full file
        res.set({
          ...commonHeaders,
          'Content-Length': stat.size
        });
        
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (error: unknown) {
      console.error('Error serving audio:', error);
      const isUnsupportedFormat = error instanceof Error && error.message?.includes('Unsupported audio format');
      const errorMessage = error instanceof Error ? error.message : 'Failed to serve audio file';
      
      res.status(isUnsupportedFormat ? 415 : 500).json({ 
        error: isUnsupportedFormat ? errorMessage : 'Failed to serve audio file',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      });
    }
  });

  app.post("/api/stories", async (req, res) => {
    try {
      const { childName, childAge, mainCharacter, theme } = req.body;
      console.log('Story generation request:', {
        ...req.body,
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