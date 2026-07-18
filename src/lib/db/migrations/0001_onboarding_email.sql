-- Regula AI — Onboarding & Email Digest Migration

DO $$ BEGIN
  CREATE TYPE digest_preference AS ENUM ('daily', 'weekly', 'off');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS digest_preference digest_preference NOT NULL DEFAULT 'daily';
