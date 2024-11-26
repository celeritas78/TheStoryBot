import type { Express } from "express";
import { db } from "../db";
import { stories, storySegments } from "@db/schema";
import { generateStoryContent, generateImage, generateSpeech } from "./services/openai";
import { eq } from "drizzle-orm";

export function registerRoutes(app: Express) {
  app.post("/api/stories", async (req, res) => {
    try {
      const { childName, childAge, mainCharacter, theme } = req.body;

      // Generate initial story content
      const storyContent = await generateStoryContent({
        childName,
        childAge,
        mainCharacter,
        theme,
      });

      // Generate image for the story
      const imageUrl = await generateImage(storyContent.sceneDescription);

      // Generate audio narration
      const audioUrl = await generateSpeech(storyContent.text);

      // Save to database
      const [story] = await db.insert(stories).values({
        childName,
        childAge,
        characters: { mainCharacter },
        theme,
        content: storyContent.text,
        imageUrls: [imageUrl],
      }).returning();

      await db.insert(storySegments).values({
        storyId: story.id,
        content: storyContent.text,
        imageUrl,
        sequence: 1,
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
      console.error("Error generating story:", error);
      res.status(500).json({ error: "Failed to generate story" });
    }
  });

  app.post("/api/stories/:id/continue", async (req, res) => {
    try {
      const { id } = req.params;

      const story = await db.query.stories.findFirst({
        where: eq(stories.id, parseInt(id)),
        with: {
          segments: true,
        },
      });

      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }

      // Generate continuation
      const continuation = await generateStoryContent({
        previousContent: story.content,
        childName: story.childName,
        childAge: story.childAge,
        characters: story.characters,
        theme: story.theme,
      });

      const imageUrl = await generateImage(continuation.sceneDescription);
      const audioUrl = await generateSpeech(continuation.text);

      // Save new segment
      await db.insert(storySegments).values({
        storyId: story.id,
        content: continuation.text,
        imageUrl,
        sequence: story.segments.length + 1,
      });

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
}
