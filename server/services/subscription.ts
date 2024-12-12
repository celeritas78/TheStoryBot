import { db } from '../../db';
import { users, stories } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { MAX_FREE_STORIES, PLANS } from '../config';

interface SubscriptionStatus {
  isEligible: boolean;
  totalStories: number;
  message: string;
}

// Logger utility for subscription operations
const subscriptionLogger = {
  info: (message: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'subscription',
      message,
      ...data,
    }));
  },
  error: (message: string, error: unknown) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: 'subscription',
      message,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : String(error)
    }));
  }
};

export async function checkStoryCreationEligibility(userId: number): Promise<SubscriptionStatus> {
  try {
    subscriptionLogger.info('Starting story creation eligibility check', { userId });

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

    const status: SubscriptionStatus = {
      isEligible: totalStories < MAX_FREE_STORIES,
      totalStories,
      message: totalStories >= MAX_FREE_STORIES ? 
        `Free plan limit reached (${totalStories}/${MAX_FREE_STORIES} stories)` :
        `${MAX_FREE_STORIES - totalStories} free stories remaining`
    };

    subscriptionLogger.info('Eligibility check completed', { userId, status });
    return status;
  } catch (error) {
    subscriptionLogger.error('Error checking story creation eligibility', error);
    throw error;
  }
}

export const subscriptionService = {
  checkStoryCreationEligibility,
  logger: subscriptionLogger,
};