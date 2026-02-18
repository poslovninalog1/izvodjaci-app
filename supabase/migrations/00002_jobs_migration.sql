-- =============================================================================
-- Phase 2: Jobs table migration (ALTER existing, preserve data)
-- =============================================================================

-- Ensure jobs table exists (create if it was never created)
CREATE TABLE IF NOT EXISTS jobs (
  id bigserial PRIMARY KEY,
  title text,
  description text,
  municipality text,
  budget_max numeric,
  created_at timestamptz DEFAULT now()
);

-- Add id if missing (for tables created without it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'id'
  ) THEN
    ALTER TABLE jobs ADD COLUMN id bigserial;
    ALTER TABLE jobs ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Rename municipality -> city (if municipality exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'municipality'
  ) THEN
    ALTER TABLE jobs RENAME COLUMN municipality TO city;
  END IF;
END $$;

-- Add city if missing (for fresh tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'city'
  ) THEN
    ALTER TABLE jobs ADD COLUMN city text;
  END IF;
END $$;

-- Add new columns (idempotent)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES profiles(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS category_id bigint REFERENCES categories(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS budget_type text DEFAULT 'fixed';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS budget_min numeric;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_remote boolean DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Enforce budget_type constraint (drop if exists to avoid errors on re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_budget_type_check'
  ) THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_budget_type_check
      CHECK (budget_type IN ('fixed', 'hourly'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_status_check'
  ) THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
      CHECK (status IN ('draft', 'published', 'closed'));
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs (category_id);
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs (city);
CREATE INDEX IF NOT EXISTS idx_jobs_skills ON jobs USING GIN (skills);
