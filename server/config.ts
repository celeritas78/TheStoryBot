// Credits and Plan Configuration
export const CREDITS_PER_USD = 1; // 1 USD = 1 credit
export const MAX_CREDITS_PURCHASE = 100; // Maximum credits per purchase
export const MIN_CREDITS_PURCHASE = 1; // Minimum credits per purchase
export const FREE_CREDITS = 3; // Free credits for new users
export const CREDIT_EXPIRY_DAYS = null; // Credits don't expire
export const MAX_FREE_STORIES = 3; // Maximum stories for free plan

// Plan Features
export const PLANS = {
  FREE: {
    name: 'Free Plan',
    maxStories: MAX_FREE_STORIES,
    initialCredits: FREE_CREDITS,
    features: [
      'Create up to 3 stories',
      'Basic story customization',
      'View created stories',
    ]
  },
  PREMIUM: {
    name: 'Premium Plan',
    features: [
      'Unlimited story creation (with credits)',
      'Priority story generation',
      'Advanced customization options',
      'Download stories in PDF format'
    ]
  }
} as const;

// Stripe configuration
export const STRIPE_CURRENCY = 'usd';
export const STRIPE_PAYMENT_MODE = 'payment';
export const STRIPE_STATEMENT_DESCRIPTOR = 'Story Credits';
export const STRIPE_STATEMENT_DESCRIPTOR_SUFFIX = 'Credits';
export const STRIPE_TEST_MODE = true;
export const STRIPE_API_VERSION = '2024-11-20.acacia' as const; // Use latest stable API version

// Transaction Status
export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;
