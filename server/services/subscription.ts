import { db } from '../../db';
import { users, stories } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { MAX_STORIES } from '../config';

interface StoryLimitStatus {
  isEligible: boolean;
  totalStories: number;
  message: string;
}

export async function checkStoryCreationEligibility(userId: number): Promise<StoryLimitStatus> {
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

  return {
    isEligible,
    totalStories,
    message: isEligible ? 
      `${MAX_STORIES - totalStories} stories remaining` :
      `Story limit reached (${totalStories}/${MAX_STORIES} stories)`
  };
}

export const subscriptionService = {
  checkStoryCreationEligibility
};