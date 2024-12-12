import { db } from '../../db';
import { users, stories } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { MAX_STORIES } from '../config';

interface StoryLimitStatus {
  isEligible: boolean;
  totalStories: number;
  message: string;
}

// Simple logger for story limit checks
function logStoryLimit(userId: number, message: string, data?: any) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'story-limit',
    userId,
    message,
    ...data
  }));
}

export async function checkStoryCreationEligibility(userId: number): Promise<StoryLimitStatus> {
  try {
    // Get user's story count
    const result = await db
      .select({
        totalStories: sql<number>`count(${stories.id})::int`
      })
      .from(users)
      .leftJoin(stories, eq(stories.userId, users.id))
      .where(eq(users.id, userId))
      .groupBy(users.id)
      .execute();

    const totalStories = Number(result[0]?.totalStories) || 0;
    const isEligible = totalStories < MAX_STORIES;

    const status: StoryLimitStatus = {
      isEligible,
      totalStories,
      message: isEligible ? 
        `${MAX_STORIES - totalStories} stories remaining` :
        `Story limit reached (${totalStories}/${MAX_STORIES} stories)`
    };

    logStoryLimit(userId, 'Story limit check completed', { status });
    return status;
  } catch (error) {
    logStoryLimit(userId, 'Error checking story limit', { error: String(error) });
    throw error;
  }
}

export const subscriptionService = {
  checkStoryCreationEligibility
};