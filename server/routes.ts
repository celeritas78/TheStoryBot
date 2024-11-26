import type { Express } from "express";
import { db } from "../db";
import { stories, storySegments, favorites, type InsertStorySegment } from "@db/schema";
import { generateStoryContent, generateImage, generateSpeech } from "./services/openai";
import { eq, desc } from "drizzle-orm";

export function registerRoutes(app: Express) {
  app.post("/api/stories", async (req, res) => {
    try {
      const { childName, childAge, mainCharacter, theme } = req.body;
      console.log('Received story generation request:', req.body);

      if (!childName || !childAge || !mainCharacter || !theme) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Generate initial story content
      const storyContent = await generateStoryContent({
        childName,
        childAge: Number(childAge),
        mainCharacter,
        theme,
      });

      // Generate image for the story
      console.log('Generated content:', storyContent);
      let imageUrl: string;
      try {
        imageUrl = await generateImage(storyContent.sceneDescription);
        console.log('Generated image URL:', imageUrl);
      } catch (error) {
        console.error('Failed to generate image:', error);
        throw new Error("Failed to generate image");
      }

      // Generate audio narration
      let audioUrl: string;
      try {
        audioUrl = await generateSpeech(storyContent.text);
      } catch (error) {
        console.error('Failed to generate audio:', error);
        throw new Error("Failed to generate audio");
      }

      if (!imageUrl || !audioUrl) {
        throw new Error("Failed to generate media resources");
      }

      // Save to database
      const [story] = await db.insert(stories).values({
        childName,
        childAge: Number(childAge),
        characters: JSON.stringify({ mainCharacter }),
        theme,
        content: storyContent.text,
        imageUrls: JSON.stringify([imageUrl]),
      }).returning();

      if (!story || !story.id) {
        throw new Error("Failed to create story");
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
