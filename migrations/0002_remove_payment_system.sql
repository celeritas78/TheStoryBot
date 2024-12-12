DROP TABLE IF EXISTS "credit_transactions";

ALTER TABLE "users" 
  DROP COLUMN IF EXISTS "is_premium",
  DROP COLUMN IF EXISTS "story_credits";
