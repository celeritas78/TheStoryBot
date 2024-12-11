import { db } from '../../db';
import { users, stories, creditTransactions } from '../../db/schema';
import { eq, sql, and } from 'drizzle-orm';
import { 
  MAX_FREE_STORIES, 
  FREE_CREDITS, 
  PLANS,
  TRANSACTION_TYPES 
} from '../config';

interface SubscriptionStatus {
  isEligible: boolean;
  currentCredits: number;
  isPremium: boolean;
  totalStories: number;
  message: string;
  plan?: typeof PLANS.FREE | typeof PLANS.PREMIUM;
}

// Enhanced Logger utility for subscription operations
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
  error: (message: string, error: Error | unknown) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: 'subscription',
      message,
      error: {
        message: error.message || error,
        stack: error.stack,
      },
    }));
  }
};

export async function checkStoryCreationEligibility(userId: number): Promise<SubscriptionStatus> {
  try {
    subscriptionLogger.info('Checking story creation eligibility', { userId });

    // Get user details with story count in a single query
    const result = await db
      .select({
        credits: users.storyCredits,
        isPremium: users.isPremium,
        totalStories: sql<number>`count(${stories.id})::int`
      })
      .from(users)
      .leftJoin(stories, eq(stories.userId, users.id))
      .where(eq(users.id, userId))
      .groupBy(users.id, users.storyCredits, users.isPremium)
      .execute();

    const user = result[0];
    
    if (!user) {
      subscriptionLogger.error('User not found', { userId });
      throw new Error('User not found');
    }

    const status: SubscriptionStatus = {
      isEligible: false,
      currentCredits: user.credits,
      isPremium: user.isPremium,
      totalStories: Number(user.totalStories) || 0,
      message: '',
      plan: user.isPremium ? PLANS.PREMIUM : PLANS.FREE
    };

    // Check eligibility based on plan type
    if (!user.isPremium) {
      if (status.totalStories >= MAX_FREE_STORIES) {
        status.message = `Free plan limit reached (${status.totalStories}/${MAX_FREE_STORIES} stories)`;
        subscriptionLogger.info('Free plan limit reached', { userId, status });
        return status;
      }
    } else if (user.credits <= 0) {
      status.message = 'Insufficient credits';
      subscriptionLogger.info('Premium user out of credits', { userId, status });
      return status;
    }

    status.isEligible = true;
    status.message = user.isPremium 
      ? `${user.credits} credits remaining`
      : `${MAX_FREE_STORIES - status.totalStories} free stories remaining`;

    subscriptionLogger.info('Eligibility check completed', { userId, status });
    return status;
  } catch (error) {
    subscriptionLogger.error('Error checking story creation eligibility', error);
    throw error;
  }
}

export async function deductStoryCredit(userId: number): Promise<number | undefined> {
  try {
    subscriptionLogger.info('Deducting story credit', { userId });

    // First check eligibility
    const eligibility = await checkStoryCreationEligibility(userId);
    
    if (!eligibility.isEligible) {
      subscriptionLogger.error('User not eligible for credit deduction', {
        userId,
        status: eligibility
      });
      return undefined;
    }

    // If eligible, deduct credit for premium users only
    if (eligibility.isPremium) {
      const result = await db
        .update(users)
        .set({ 
          storyCredits: sql`${users.storyCredits} - 1`,
          updatedAt: new Date()
        })
        .where(and(
          eq(users.id, userId),
          sql`${users.storyCredits} > 0`
        ))
        .returning({ newCredits: users.storyCredits })
        .execute();

      const newCredits = result[0]?.newCredits;
      
      if (newCredits === undefined) {
        subscriptionLogger.error('Failed to deduct credit', { userId });
        return undefined;
      }

      subscriptionLogger.info('Credit deducted successfully', { 
        userId, 
        previousCredits: eligibility.currentCredits,
        newCredits
      });

      return newCredits;
    }

    // For free plan users, just return current credits
    return eligibility.currentCredits;
  } catch (error) {
    subscriptionLogger.error('Error deducting story credit', error);
    throw error;
  }
}

export async function addStoryCredits(userId: number, credits: number): Promise<number> {
  try {
    subscriptionLogger.info('Adding story credits', { userId, credits });

    const result = await db
      .select({
        currentCredits: users.storyCredits,
      })
      .from(users)
      .where(eq(users.id, userId))
      .execute();

    const user = result[0];
    if (!user) {
      subscriptionLogger.error('User not found for adding credits', { userId });
      throw new Error('User not found');
    }

    const newCredits = user.currentCredits + credits;

    const updateResult = await db
      .update(users)
      .set({ 
        storyCredits: newCredits,
        isPremium: true,  // User becomes premium when they purchase credits
      })
      .where(eq(users.id, userId))
      .returning({ updatedCredits: users.storyCredits })
      .execute();

    const finalCredits = updateResult[0]?.updatedCredits ?? newCredits;

    subscriptionLogger.info('Credits added successfully', {
      userId,
      previousCredits: user.currentCredits,
      addedCredits: credits,
      newCredits: finalCredits,
    });

    return finalCredits;
  } catch (error) {
    subscriptionLogger.error('Error adding story credits', error);
    throw error;
  }
}

export const subscriptionService = {
  checkStoryCreationEligibility,
  deductStoryCredit,
  addStoryCredits,
  logger: subscriptionLogger,
};