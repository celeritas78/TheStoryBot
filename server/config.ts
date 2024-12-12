// Credits and Plan Configuration
export const MAX_CREDITS_PURCHASE = 100; // Maximum credits per purchase
export const MIN_CREDITS_PURCHASE = 1; // Minimum credits per purchase
export const FREE_CREDITS = 3; // Free credits for new users
export const MAX_FREE_STORIES = 3; // Maximum stories for free plan

// Currency Configuration
export const SUPPORTED_CURRENCIES = {
  USD: {
    code: 'usd',
    symbol: '$',
    name: 'US Dollar',
    creditsPerUnit: 1, // 1 USD = 1 credit
    minAmount: 1,
    maxAmount: 100
  },
  EUR: {
    code: 'eur',
    symbol: '€',
    name: 'Euro',
    creditsPerUnit: 1.1, // 1 EUR ≈ 1.1 credits
    minAmount: 1,
    maxAmount: 85
  },
  GBP: {
    code: 'gbp',
    symbol: '£',
    name: 'British Pound',
    creditsPerUnit: 1.25, // 1 GBP ≈ 1.25 credits
    minAmount: 1,
    maxAmount: 75
  },
  INR: {
    code: 'inr',
    symbol: '₹',
    name: 'Indian Rupee',
    creditsPerUnit: 0.012, // 1 INR ≈ 0.012 credits
    minAmount: 100,
    maxAmount: 8000
  }
} as const;

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
      maxCreditPurchase: MAX_CREDITS_PURCHASE
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

// Stripe Configuration
export const STRIPE_DEFAULT_CURRENCY = SUPPORTED_CURRENCIES.USD.code;
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

// Helper function to calculate credits from amount and currency
export function calculateCredits(amount: number, currency: keyof typeof SUPPORTED_CURRENCIES): number {
  const currencyConfig = SUPPORTED_CURRENCIES[currency];
  return Math.floor(amount * currencyConfig.creditsPerUnit);
}

// Helper function to validate purchase amount for currency
export function validatePurchaseAmount(amount: number, currency: keyof typeof SUPPORTED_CURRENCIES): {
  isValid: boolean;
  error?: string;
} {
  const currencyConfig = SUPPORTED_CURRENCIES[currency];
  
  if (amount < currencyConfig.minAmount) {
    return {
      isValid: false,
      error: `Minimum amount for ${currencyConfig.name} is ${currencyConfig.symbol}${currencyConfig.minAmount}`
    };
  }
  
  if (amount > currencyConfig.maxAmount) {
    return {
      isValid: false,
      error: `Maximum amount for ${currencyConfig.name} is ${currencyConfig.symbol}${currencyConfig.maxAmount}`
    };
  }

  const credits = calculateCredits(amount, currency);
  if (credits < MIN_CREDITS_PURCHASE || credits > MAX_CREDITS_PURCHASE) {
    return {
      isValid: false,
      error: `Amount would result in ${credits} credits. Must be between ${MIN_CREDITS_PURCHASE} and ${MAX_CREDITS_PURCHASE} credits`
    };
  }

  return { isValid: true };
}
