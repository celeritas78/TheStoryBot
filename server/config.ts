// Credits and Plan Configuration
export const CREDITS_PER_USD = 1; // 1 USD = 1 credit
export const MAX_CREDITS_PURCHASE = 100; // Maximum credits per purchase
export const MIN_CREDITS_PURCHASE = 1; // Minimum credits per purchase
export const FREE_CREDITS = 3; // Free credits for new users
export const MAX_FREE_STORIES = 3; // Maximum stories for free plan

// Plan Configuration
export const PLANS = {
  FREE: {
    id: 'free',
    name: 'Free Plan',
    maxStories: MAX_FREE_STORIES,
    initialCredits: FREE_CREDITS,
    features: [
      'Create up to 3 stories',
      'Basic story customization',
      'View created stories',
      'Save stories to library'
    ],
    limitations: {
      maxStories: MAX_FREE_STORIES,
      requiresCredits: false
    }
  },
  PREMIUM: {
    id: 'premium',
    name: 'Premium Plan',
    features: [
      'Unlimited story creation (with credits)',
      'Priority story generation',
      'Advanced customization options',
      'Download stories in PDF format',
      'Premium support'
    ],
    limitations: {
      maxStories: null, // Unlimited with credits
      requiresCredits: true,
      creditCost: 1, // 1 credit per story
      minCreditPurchase: MIN_CREDITS_PURCHASE,
      maxCreditPurchase: MAX_CREDITS_PURCHASE,
      creditPriceUSD: 1 // $1 per credit
    }
  }
} as const;

// Credit Transaction Types
export const TRANSACTION_TYPES = {
  INITIAL_FREE_CREDITS: 'initial_free_credits',
  CREDIT_PURCHASE: 'credit_purchase',
  STORY_CREATION: 'story_creation',
  PREMIUM_UPGRADE: 'premium_upgrade'
} as const;

// Stripe configuration
export const STRIPE_CURRENCY = 'usd';
export const STRIPE_STATEMENT_DESCRIPTOR = 'Story Credits';
export const STRIPE_STATEMENT_DESCRIPTOR_SUFFIX = 'Credits';
export const STRIPE_API_VERSION = '2024-11-20.acacia' as const;

// Transaction Status
export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;
