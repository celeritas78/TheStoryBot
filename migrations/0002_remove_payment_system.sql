DROP TABLE IF EXISTS "credit_transactions";

-- Keep story_credits column but remove Stripe-specific columns
ALTER TABLE "users" 
  DROP COLUMN IF EXISTS "is_premium";
