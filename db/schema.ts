import { pgTable, text, integer, jsonb, timestamp, boolean, serial, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 50 }).default("local"),
  providerId: varchar("provider_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const stories = pgTable("stories", {
  id: serial("id").primaryKey(),
  title: text("title"),
  childName: text("child_name").notNull(),
  childAge: integer("child_age").notNull(),
  characters: jsonb("characters").notNull(),
  theme: text("theme").notNull(),
  content: text("content").notNull(),
  imageUrls: jsonb("image_urls").notNull(),
  parentApproved: boolean("parent_approved").default(false),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storySegments = pgTable("story_segments", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id")
    .notNull()
    .references(() => stories.id, { onDelete: 'cascade' }),
  content: text("content").notNull(),
  imageUrl: text("image_url").notNull(),
  audioUrl: text("audio_url").notNull(),
  sequence: integer("sequence").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Define relations
export const userRelations = relations(users, ({ many }) => ({
  stories: many(stories),
}));

export const storiesRelations = relations(stories, ({ many, one }) => ({
  segments: many(storySegments),
  user: one(users, {
    fields: [stories.userId],
    references: [users.id],
  }),
}));

export const storySegmentsRelations = relations(storySegments, ({ one }) => ({
  story: one(stories, {
    fields: [storySegments.storyId],
    references: [stories.id],
  }),
}));

// Schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = z.infer<typeof selectUserSchema>;

export const insertStorySchema = createInsertSchema(stories);
export const selectStorySchema = createSelectSchema(stories);
export type InsertStory = z.infer<typeof insertStorySchema>;
export type Story = z.infer<typeof selectStorySchema>;

export const insertStorySegmentSchema = createInsertSchema(storySegments);
export const selectStorySegmentSchema = createSelectSchema(storySegments);
export type InsertStorySegment = z.infer<typeof insertStorySegmentSchema>;
export type StorySegment = z.infer<typeof selectStorySegmentSchema>;
