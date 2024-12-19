CREATE TABLE IF NOT EXISTS "credit_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "amount" integer NOT NULL,
  "credits" integer NOT NULL,
  "status" varchar(50) NOT NULL,
  "stripe_payment_id" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "credit_transactions_user_id_fkey" 
    FOREIGN KEY ("user_id") 
    REFERENCES "users"("id") 
    ON DELETE CASCADE
);
