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

  // Get all stories
  app.get("/api/stories", async (req, res) => {
    try {
      const allStories = await db.query.stories.findMany({
        orderBy: [desc(stories.createdAt)],
        with: {
          segments: {
            where: eq(storySegments.sequence, 1)
          }
        }
      });
      res.json(allStories);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ error: "Failed to fetch stories" });
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
        return res.status(400).json({ 
          error: "Missing required fields",
          details: errorDetails
        });
      }

      const parsedAge = Number(childAge);
      if (isNaN(parsedAge)) {
        return res.status(400).json({ error: "Invalid age format" });
      }

      const storyContent = await generateStoryContent({
        childName,
        childAge: parsedAge,
        mainCharacter,
        theme,
      });

      const imageData = await generateImage(storyContent.sceneDescription);
      const audioUrl = await generateSpeech(storyContent.text);

      const [story] = await db.insert(stories)
        .values({
          childName,
          childAge: parsedAge,
          characters: JSON.stringify({ mainCharacter }),
          theme,
          content: storyContent.text,
          imageData,
        })
        .returning();

      const segment: InsertStorySegment = {
        storyId: story.id,
        content: storyContent.text,
        imageData,
        audioUrl,
        sequence: 1,
      };

      const [newSegment] = await db.insert(storySegments)
        .values(segment)
        .returning();

      res.json({
        id: story.id,
        segments: [{
          content: storyContent.text,
          imageData,
          audioUrl,
        }],
      });
    } catch (error) {
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

  // Continue a story
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
        orderBy: [desc(storySegments.sequence)],
      });

      const continuation = await generateStoryContent({
        previousContent: story.content,
        childName: story.childName,
        childAge: story.childAge,
        mainCharacter: characters.mainCharacter,
        theme: story.theme,
      });

      const imageData = await generateImage(continuation.sceneDescription);
      const audioUrl = await generateSpeech(continuation.text);

      const segment: InsertStorySegment = {
        storyId: story.id,
        content: continuation.text,
        imageData,
        audioUrl,
        sequence: (segments?.length ?? 0) + 1,
      };

      const [newSegment] = await db.insert(storySegments)
        .values(segment)
        .returning();

      res.json({
        content: continuation.text,
        imageData,
        audioUrl,
      });
    } catch (error) {
      console.error("Error continuing story:", error);
      res.status(500).json({ error: "Failed to continue story" });
    }
  });
}
  // Get favorites
  app.get("/api/favorites", async (req, res) => {
    try {
      const favoriteStories = await db.query.favorites.findMany({
        with: {
          story: {
            with: {
              segments: {
                where: eq(storySegments.sequence, 1)
              }
            }
          }
        },
        orderBy: [desc(favorites.createdAt)]
      });

      const formattedFavorites = favoriteStories.map(fav => ({
        id: fav.story.id,
        childName: fav.story.childName,
        theme: fav.story.theme,
        createdAt: fav.story.createdAt,
        favoriteId: fav.id,
        firstSegment: fav.story.segments[0]
      }));

      res.json(formattedFavorites);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      res.status(500).json({ error: "Failed to fetch favorites" });
    }
  });

  // Add to favorites
  app.post("/api/favorites/:storyId", async (req, res) => {
    try {
      const storyId = parseInt(req.params.storyId);
      const [favorite] = await db.insert(favorites)
        .values({ storyId })
        .returning();
      res.json(favorite);
    } catch (error) {
      console.error("Error adding to favorites:", error);
      res.status(500).json({ error: "Failed to add to favorites" });
    }
  });

  // Remove from favorites
  app.delete("/api/favorites/:storyId", async (req, res) => {
    try {
      const storyId = parseInt(req.params.storyId);
      await db.delete(favorites)
        .where(eq(favorites.storyId, storyId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing from favorites:", error);
      res.status(500).json({ error: "Failed to remove from favorites" });
    }
  });