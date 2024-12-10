// Credits configuration
export const CREDITS_PER_USD = 1; // 1 USD = 1 credit (price in cents)
export const MAX_CREDITS_PURCHASE = 100; // Maximum credits that can be purchased at once
export const MIN_CREDITS_PURCHASE = 1; // Minimum credits that can be purchased
export const FREE_CREDITS = 3; // Number of free credits for new users

// Stripe configuration
export const STRIPE_CURRENCY = 'usd';
export const STRIPE_PAYMENT_MODE = 'payment';
export const STRIPE_STATEMENT_DESCRIPTOR = 'Story Credits';
export const STRIPE_STATEMENT_DESCRIPTOR_SUFFIX = 'Credits';
