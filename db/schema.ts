import { pgTable, text, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const favorites = pgTable("favorites", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  storyId: integer("story_id").references(() => stories.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const stories = pgTable("stories", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  childName: text("child_name").notNull(),
  childAge: integer("child_age").notNull(),
  characters: jsonb("characters").notNull(),
  theme: text("theme").notNull(),
  content: text("content").notNull(),
  imageUrls: jsonb("image_urls").notNull(),
  parentApproved: boolean("parent_approved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storySegments = pgTable("story_segments", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  storyId: integer("story_id").notNull().references(() => stories.id),
  content: text("content").notNull(),
  imageUrl: text("image_url").notNull(),
  sequence: integer("sequence").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStorySchema = createInsertSchema(stories);
export const selectStorySchema = createSelectSchema(stories);
export type InsertStory = z.infer<typeof insertStorySchema>;
export const insertFavoriteSchema = createInsertSchema(favorites);
export const selectFavoriteSchema = createSelectSchema(favorites);
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type Favorite = z.infer<typeof selectFavoriteSchema>;
export type Story = z.infer<typeof selectStorySchema>;

export const insertStorySegmentSchema = createInsertSchema(storySegments);
export const selectStorySegmentSchema = createSelectSchema(storySegments);
export type InsertStorySegment = z.infer<typeof insertStorySegmentSchema>;
export type StorySegment = z.infer<typeof selectStorySegmentSchema>;
