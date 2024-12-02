import { type Express, type Response } from "express";
import { eq, desc, and, or, neq } from "drizzle-orm";
import { db } from "../db";
import { users, stories, storySegments } from "@db/schema";
import { generateStoryContent } from "./services/openai";
import { generateImage } from "./services/dalle";
import { generateSpeech } from "./services/elevenlabs";

function sendErrorResponse(res: Response, status: number, message: string, details?: any) {
  console.error(`Error ${status}: ${message}`, details);
  res.status(status).json({ error: message, ...(details && { details }) });
}

export function setupRoutes(app: Express) {
  app.put("/api/user/profile", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return sendErrorResponse(res, 401, "Authentication required");
      }

      const { username, email } = req.body;

      // Validate input
      if (!username?.trim() || !email?.trim()) {
        return sendErrorResponse(res, 400, "Username and email are required");
      }

      // Check if username or email is already taken by another user
      const [existingUser] = await db
        .select()
        .from(users)
        .where(
          and(
            or(eq(users.username, username), eq(users.email, email)),
            neq(users.id, req.user.id)
          )
        )
        .limit(1);

      if (existingUser) {
        if (existingUser.username === username) {
          return sendErrorResponse(res, 400, "Username is already taken");
        }
        return sendErrorResponse(res, 400, "Email is already registered");
      }

      // Update user profile
      const [updatedUser] = await db
        .update(users)
        .set({
          username,
          email,
        })
        .where(eq(users.id, req.user.id))
        .returning();

      res.json({
        message: "Profile updated successfully",
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
        },
      });
    } catch (error) {
      console.error("Profile update error:", error);
      sendErrorResponse(res, 500, "Failed to update profile");
    }
  });

  // Story related routes
  app.post("/api/stories", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return sendErrorResponse(res, 401, "Authentication required");
      }

      const { childName, childAge, mainCharacter, theme } = req.body;

      // Validate childAge
      const parsedAge = parseInt(childAge);
      if (isNaN(parsedAge) || parsedAge < 2 || parsedAge > 12) {
        return sendErrorResponse(res, 400, "Child age must be between 2 and 12");
      }

      const storyContent = await generateStoryContent({
        childName,
        childAge: parsedAge,
        mainCharacter,
        theme,
      });

      // Save to database with better error handling
      const [story] = await db.insert(stories)
        .values({
          userId: req.user.id,
          childName,
          childAge: parsedAge,
          characters: JSON.stringify({ mainCharacter }),
          theme,
          content: storyContent.content,
          parentApproved: false,
          createdAt: new Date(),
        })
        .returning();

      // Generate and save segments
      const segments = await Promise.all(storyContent.scenes.map(async (scene, index) => {
        const imageUrl = await generateImage(scene.description);
        const audioUrl = await generateSpeech(scene.text);
        
        return {
          storyId: story.id,
          content: scene.text,
          imageUrl,
          audioUrl,
          sequence: index + 1,
        };
      }));

      const insertedSegments = await db.insert(storySegments)
        .values(segments)
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
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return sendErrorResponse(res, 401, "Authentication required");
      }

      console.log('Fetching stories for user:', req.user.id);
      const allStories = await db.query.stories.findMany({
        where: eq(stories.userId, req.user.id),
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
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return sendErrorResponse(res, 401, "Authentication required");
      }

      const story = await db.query.stories.findFirst({
        where: eq(stories.id, parseInt(req.params.id)),
        with: {
          segments: true,
          user: true,
        }
      });
      
      // Check if story exists and belongs to the user
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      
      if (story.userId !== req.user.id) {
        return sendErrorResponse(res, 403, "Unauthorized access to story");
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ error: "Failed to fetch story" });
    }
  });
}