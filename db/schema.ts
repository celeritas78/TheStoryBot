import { pgTable, text, integer, jsonb, timestamp, boolean, serial, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull().default("local"),
  providerId: varchar("provider_id", { length: 255 }),
  displayName: varchar("display_name", { length: 255 }),
  avatarUrl: varchar("avatar_url", { length: 512 }),
  childPhotoUrl: varchar("child_photo_url", { length: 512 }),
  bio: text("bio"),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: varchar("verification_token", { length: 255 }),
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  resetToken: varchar("reset_token", { length: 255 }),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  lastLoginAt: timestamp("last_login_at"),
  active: boolean("active").notNull().default(true),
  isPremium: boolean("is_premium").notNull().default(false),
  storyCredits: integer("story_credits").notNull().default(3),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
  userId: integer("user_id"),
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

export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  amount: integer("amount").notNull(),
  credits: integer("credits").notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  stripePaymentId: varchar("stripe_payment_id", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Define relations
export const userRelations = relations(users, ({ many }) => ({
  stories: many(stories),
  creditTransactions: many(creditTransactions),
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

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions);
export const selectCreditTransactionSchema = createSelectSchema(creditTransactions);
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;
export type CreditTransaction = z.infer<typeof selectCreditTransactionSchema>;
