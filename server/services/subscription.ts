import { db } from '../../db';
import { users, stories } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { MAX_STORIES } from '../config';

interface StoryLimitStatus {
  isEligible: boolean;
  totalStories: number;
  message: string;
}

// Logger utility for story limit operations
const storyLimitLogger = {
  info: (message: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'story-limit',
      message,
      ...data,
    }));
  },
  error: (message: string, error: unknown) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: 'story-limit',
      message,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : String(error)
    }));
  }
};

export async function checkStoryCreationEligibility(userId: number): Promise<StoryLimitStatus> {
  try {
    storyLimitLogger.info('Starting story limit check', { userId });

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

    const user = result[0];
    
    if (!user) {
      throw new Error('User not found');
    }

    const totalStories = Number(user.totalStories) || 0;

    const status: StoryLimitStatus = {
      isEligible: totalStories < MAX_STORIES,
      totalStories,
      message: totalStories >= MAX_STORIES ? 
        `Story limit reached (${totalStories}/${MAX_STORIES} stories)` :
        `${MAX_STORIES - totalStories} stories remaining`
    };

    storyLimitLogger.info('Story limit check completed', { userId, status });
    return status;
  } catch (error) {
    storyLimitLogger.error('Error checking story creation eligibility', error);
    throw error;
  }
}

export const subscriptionService = {
  checkStoryCreationEligibility,
  logger: storyLimitLogger,
};