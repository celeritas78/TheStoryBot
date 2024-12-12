// Credits and Plan Configuration
export const MAX_CREDITS_PURCHASE = 100; // Maximum credits per purchase
export const MIN_CREDITS_PURCHASE = 1; // Minimum credits per purchase
export const FREE_CREDITS = 3; // Free credits for new users
export const MAX_FREE_STORIES = 3; // Maximum stories for free plan
export const CREDITS_PER_USD = 1; // Base rate: 1 USD = 1 credit

// Currency Configuration Types
type CurrencyCode = 'usd' | 'eur' | 'gbp' | 'inr';

interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  creditsPerUnit: number;
  minAmount: number;
  maxAmount: number;
}

// Currency Configuration
export const SUPPORTED_CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  usd: {
    code: 'usd',
    symbol: '$',
    name: 'US Dollar',
    creditsPerUnit: CREDITS_PER_USD,
    minAmount: 1,
    maxAmount: 100
  },
  eur: {
    code: 'eur',
    symbol: '€',
    name: 'Euro',
    creditsPerUnit: CREDITS_PER_USD * 1.1, // EUR/USD rate
    minAmount: 1,
    maxAmount: 85
  },
  gbp: {
    code: 'gbp',
    symbol: '£',
    name: 'British Pound',
    creditsPerUnit: CREDITS_PER_USD * 1.25, // GBP/USD rate
    minAmount: 1,
    maxAmount: 75
  },
  inr: {
    code: 'inr',
    symbol: '₹',
    name: 'Indian Rupee',
    creditsPerUnit: CREDITS_PER_USD * 0.012, // INR/USD rate
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

// Transaction Types and Status
export const TRANSACTION_TYPES = {
  INITIAL_FREE_CREDITS: 'initial_free_credits',
  CREDIT_PURCHASE: 'credit_purchase',
  STORY_CREATION: 'story_creation',
  PREMIUM_UPGRADE: 'premium_upgrade'
} as const;

export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

// Payment Helper Functions
export function calculateCredits(amount: number, currency: keyof typeof SUPPORTED_CURRENCIES): number {
  const currencyConfig = SUPPORTED_CURRENCIES[currency];
  return Math.floor(amount * currencyConfig.creditsPerUnit);
}

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

// Stripe Configuration
export const STRIPE_DEFAULT_CURRENCY = 'usd' as const;
export const STRIPE_STATEMENT_DESCRIPTOR = 'Story Credits';
export const STRIPE_STATEMENT_DESCRIPTOR_SUFFIX = 'Credits';
export const STRIPE_API_VERSION = '2024-11-20.acacia' as const;
