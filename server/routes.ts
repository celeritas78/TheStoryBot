import type { Express } from "express";
import { db } from "../db";
import { stories, storySegments, favorites, type InsertStorySegment } from "@db/schema";
import { generateStoryContent, generateImage, generateSpeech } from "./services/openai";
import { eq, desc } from "drizzle-orm";

import { getAudioFilePath, audioFileExists } from './services/audio-storage';

export function registerRoutes(app: Express) {
  // Serve audio files with proper CORS and caching headers
  app.get("/audio/:filename", (req, res) => {
    try {
      const { filename } = req.params;
      
      if (!filename) {
        console.error('No filename provided');
        return res.status(400).json({ error: "No filename provided" });
      }

      if (!audioFileExists(filename)) {
        console.error('Audio file not found:', filename);
        return res.status(404).json({ error: "Audio file not found" });
      }

      const filePath = getAudioFilePath(filename);

      // Set proper headers for audio streaming
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Content-Type');

      // Handle range requests for audio seeking
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : undefined;
        
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end || ''}`);
      }

      res.sendFile(filePath, (err) => {
        if (err) {
          console.error('Error serving audio file:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to serve audio file" });
          }
        }
      });
    } catch (error) {
      console.error('Error serving audio file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to serve audio file" });
      }
    }
  });
  app.post("/api/stories", async (req, res) => {
    try {
      const { childName, childAge, mainCharacter, theme } = req.body;
      console.log('Received story generation request:', {
        ...req.body,
        timestamp: new Date().toISOString()
      });

      // Enhanced input validation
      if (!childName?.trim() || !childAge || !mainCharacter?.trim() || !theme?.trim()) {
        return res.status(400).json({ 
          error: "Missing required fields",
          details: {
            childName: !childName?.trim() ? "Name is required" : null,
            childAge: !childAge ? "Age is required" : null,
            mainCharacter: !mainCharacter?.trim() ? "Character is required" : null,
            theme: !theme?.trim() ? "Theme is required" : null
          }
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
        const [result] = await db.insert(stories).values({
          childName,
          childAge: parsedAge,
          characters: JSON.stringify({ mainCharacter }),
          theme,
          content: storyContent.text,
          imageUrls: JSON.stringify([imageUrl]),
        }).returning();

        if (!result || !result.id) {
          console.error('Database insert returned invalid result:', result);
          throw new Error("Failed to create story record");
        }
        story = result;
        console.log('Successfully created story record:', { storyId: story.id });
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

      res.json({
        id: story.id,
        segments: [{
          content: storyContent.text,
          imageUrl,
          audioUrl,
        }],
      });
    } catch (error) {
      console.error("Error generating story:", error);
      res.status(500).json({ error: "Failed to generate story" });
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

  // Get all favorite stories
  app.get("/api/favorites", async (req, res) => {
    try {
      console.log('Fetching favorites...');
      const favoriteStories = await db
        .select({
          id: stories.id,
          childName: stories.childName,
          theme: stories.theme,
          createdAt: stories.createdAt,
          favoriteId: favorites.id,
          firstSegment: storySegments,
        })
        .from(favorites)
        .innerJoin(stories, eq(favorites.storyId, stories.id))
        .innerJoin(storySegments, eq(stories.id, storySegments.storyId))
        .where(eq(storySegments.sequence, 1))
        .orderBy(desc(favorites.createdAt));

      console.log('Favorites fetched:', favoriteStories);
      res.json(favoriteStories);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      res.status(500).json({ error: "Failed to fetch favorites" });
    }
  });

  // Add story to favorites
  app.post("/api/favorites/:storyId", async (req, res) => {
    try {
      const { storyId } = req.params;
      const [favorite] = await db
        .insert(favorites)
        .values({ storyId: parseInt(storyId) })
        .returning();
      res.json(favorite);
    } catch (error) {
      console.error("Error adding to favorites:", error);
      res.status(500).json({ error: "Failed to add to favorites" });
    }
  });

  // Remove story from favorites
  app.delete("/api/favorites/:storyId", async (req, res) => {
    try {
      const { storyId } = req.params;
      await db
        .delete(favorites)
        .where(eq(favorites.storyId, parseInt(storyId)));
      res.status(204).send();
    } catch (error) {
      console.error("Error removing from favorites:", error);
      res.status(500).json({ error: "Failed to remove from favorites" });
    }
  });
}
