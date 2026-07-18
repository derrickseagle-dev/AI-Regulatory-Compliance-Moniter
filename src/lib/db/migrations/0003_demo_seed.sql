-- Add is_demo columns for demo data seeding
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;
