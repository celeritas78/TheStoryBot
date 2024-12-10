// Credits configuration
export const CREDITS_PER_USD = 1; // 1 USD = 1 credit
export const MAX_CREDITS_PURCHASE = 100; // Maximum credits per purchase
export const MIN_CREDITS_PURCHASE = 1; // Minimum credits per purchase
export const FREE_CREDITS = 3; // Free credits for new users
export const CREDIT_EXPIRY_DAYS = null; // Credits don't expire

// Stripe configuration
export const STRIPE_CURRENCY = 'usd';
export const STRIPE_PAYMENT_MODE = 'payment'; // One-time payment
export const STRIPE_STATEMENT_DESCRIPTOR = 'Story Credits';
export const STRIPE_STATEMENT_DESCRIPTOR_SUFFIX = 'Credits';
export const STRIPE_TEST_MODE = true; // Use test mode initially
