import type { Express } from "express";
import { db } from "../db";
import { stories, storySegments, type InsertStorySegment } from "@db/schema";
import { generateStoryContent, generateImage, generateSpeech } from "./services/openai";
import { eq, desc } from "drizzle-orm";
import fs from 'fs';

import { getAudioFilePath, audioFileExists } from './services/audio-storage';

const MIME_TYPES = {
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'm4a': 'audio/mp4'
};

export function registerRoutes(app: Express) {
  // Serve audio files with proper CORS and caching headers
  app.get("/audio/:filename", (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = getAudioFilePath(filename);
      
      if (!audioFileExists(filename)) {
        return res.status(404).json({ error: "Audio file not found" });
      }

      const stat = fs.statSync(filePath);
      const range = req.headers.range;

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
    try {
      const { childName, childAge, mainCharacter, theme } = req.body;
      // Add request logging
      console.log('Story generation request:', {
        ...req.body,
        timestamp: new Date().toISOString()
      });

      // Enhanced input validation
      if (!childName?.trim() || !childAge || !mainCharacter?.trim() || !theme?.trim()) {
        const errorDetails = {
          childName: !childName?.trim() ? "Name is required" : null,
          childAge: !childAge ? "Age is required" : null,
          mainCharacter: !mainCharacter?.trim() ? "Character is required" : null,
          theme: !theme?.trim() ? "Theme is required" : null,
          timestamp: new Date().toISOString()
        };
        console.error('Validation failed:', errorDetails);
        return res.status(400).json({ 
          error: "Missing required fields",
          details: errorDetails
        });
      }

      // Additional validation
      if (typeof childAge !== 'number' && isNaN(Number(childAge))) {
        return res.status(400).json({ error: "Invalid age format" });
      }

      if (mainCharacter.length > 100) {
        return res.status(400).json({ error: "Character name is too long" });
      }

      if (!['adventure', 'fantasy', 'friendship', 'nature'].includes(theme)) {
        return res.status(400).json({ error: "Invalid theme" });
      }

      console.log('Starting story generation process with params:', {
        childName,
        childAge,
        mainCharacter,
        theme
      });

      // Validate and convert childAge
      const parsedAge = Number(childAge);
      if (isNaN(parsedAge)) {
        console.error('Invalid age provided:', childAge);
        return res.status(400).json({ error: "Invalid age format" });
      }

      // Generate initial story content
      let storyContent;
      try {
        storyContent = await generateStoryContent({
          childName,
          childAge: parsedAge,
          mainCharacter,
          theme,
        });
        console.log('Successfully generated story content:', {
          contentLength: storyContent.text.length,
          sceneDescriptionLength: storyContent.sceneDescription.length
        });
      } catch (error) {
        console.error('Story generation failed:', error);
        return res.status(500).json({ 
          error: "Failed to generate story content",
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      let imageUrl: string;
      try {
        const generatedImageUrl = await generateImage(storyContent.sceneDescription);
        if (!generatedImageUrl) {
          throw new Error("Image generation returned empty URL");
        }
        imageUrl = generatedImageUrl;
        console.log('Generated image URL:', imageUrl);
      } catch (error) {
        console.error('Failed to generate image:', error instanceof Error ? error.message : 'Unknown error');
        throw new Error("Failed to generate image: " + (error instanceof Error ? error.message : 'Unknown error'));
      }

      // Generate audio narration
      let audioUrl: string;
      try {
        const generatedAudioUrl = await generateSpeech(storyContent.text);
        if (!generatedAudioUrl) {
          throw new Error("Audio generation returned empty URL");
        }
        audioUrl = generatedAudioUrl;
        console.log('Generated audio URL:', audioUrl);
      } catch (error) {
        console.error('Failed to generate audio:', error instanceof Error ? error.message : 'Unknown error');
        throw new Error("Failed to generate audio: " + (error instanceof Error ? error.message : 'Unknown error'));
      }

      // Save to database
      let story;
      try {
        // Add database operation logging
      console.log('Inserting story record:', {
        childName,
        childAge: parsedAge,
        theme,
        timestamp: new Date().toISOString()
      });

      const [result] = await db.insert(stories)
          .values({
            childName,
            childAge: parsedAge,
            characters: JSON.stringify({ mainCharacter }),
            theme,
            content: storyContent.text,
            imageUrls: JSON.stringify([imageUrl]),
          })
          .returning();

        if (!result || !result.id) {
          console.error('Database insert returned invalid result:', {
            result,
            timestamp: new Date().toISOString()
          });
          throw new Error("Failed to create story record");
        }
        story = result;
        console.log('Successfully created story record:', {
          storyId: story.id,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Database operation failed:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        throw new Error("Failed to save story to database");
      }

      // Add the first story segment
      const segment: InsertStorySegment = {
        storyId: story.id,
        content: storyContent.text,
        imageUrl,
        audioUrl,
        sequence: 1,
      };

      const [newSegment] = await db.insert(storySegments).values(segment).returning();

      // After story segments insertion
      console.log('Story segment created:', {
        storyId: story.id,
        segmentId: newSegment.id,
        timestamp: new Date().toISOString()
      });

      res.json({
        id: story.id,
        segments: [{
          content: storyContent.text,
          imageUrl,
          audioUrl,
        }],
      });
    } catch (error) {
      // Enhanced error logging
      console.error('Story generation failed:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      res.status(500).json({ 
        error: "Failed to generate story",
        details: error instanceof Error ? error.message : 'Unknown error'
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

      // Parse characters JSON
      const characters = JSON.parse(story.characters as string) as { mainCharacter: string };

      // Fetch existing segments
      const segments = await db.query.storySegments.findMany({
        where: eq(storySegments.storyId, story.id),
        orderBy: (storySegments, { desc }) => [desc(storySegments.sequence)],
      });

      // Generate continuation
      const continuation = await generateStoryContent({
        previousContent: story.content,
        childName: story.childName,
        childAge: story.childAge,
        mainCharacter: characters.mainCharacter,
        theme: story.theme,
      });

      const imageUrl = await generateImage(continuation.sceneDescription);
      const audioUrl = await generateSpeech(continuation.text);

      // Save new segment
      const segment: InsertStorySegment = {
        storyId: story.id,
        content: continuation.text,
        imageUrl,
        audioUrl,
        sequence: (segments?.length ?? 0) + 1,
      };

      const [newSegment] = await db.insert(storySegments).values(segment).returning();

      res.json({
        content: continuation.text,
        imageUrl,
        audioUrl,
      });
    } catch (error) {
      console.error("Error continuing story:", error);
      res.status(500).json({ error: "Failed to continue story" });
    }
  });

  // Get all stories endpoint
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

  // Get a specific story by ID
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
