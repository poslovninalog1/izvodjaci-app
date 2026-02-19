-- =============================================================================
-- Phase 9: Decision flow — deadline, rejection reason, status migration, expiry
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS decision_deadline timestamptz;

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS rejection_reason text;

-- ---------------------------------------------------------------------------
-- 2. Migrate existing proposal statuses BEFORE changing constraints
-- ---------------------------------------------------------------------------
UPDATE proposals SET status = 'pending'  WHERE status IN ('submitted', 'shortlisted');
UPDATE proposals SET status = 'accepted' WHERE status = 'hired';

-- Backfill rejection_reason for already-rejected proposals so the new
-- CHECK constraint won't fail.
UPDATE proposals SET rejection_reason = 'Ponuda je odbijena.'
WHERE status = 'rejected' AND (rejection_reason IS NULL OR rejection_reason = '');

-- ---------------------------------------------------------------------------
-- 3. Update CHECK constraints
-- ---------------------------------------------------------------------------
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('draft', 'published', 'closed', 'expired'));

ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'expired'));

-- Rejected proposals MUST have a non-empty reason.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_rejection_reason_required'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_rejection_reason_required
      CHECK (status != 'rejected' OR (rejection_reason IS NOT NULL AND rejection_reason != ''));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Set decision_deadline for existing published jobs
-- ---------------------------------------------------------------------------
UPDATE jobs SET decision_deadline = created_at + interval '7 days'
WHERE status = 'published' AND decision_deadline IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Auto-set decision_deadline on INSERT (published jobs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_job_decision_deadline()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.decision_deadline IS NULL AND NEW.status = 'published' THEN
    NEW.decision_deadline := COALESCE(NEW.created_at, now()) + interval '7 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_decision_deadline ON jobs;
CREATE TRIGGER trg_set_decision_deadline
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_job_decision_deadline();

-- ---------------------------------------------------------------------------
-- 6. Indexes (IF NOT EXISTS — safe to re-run)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jobs_created_at_desc   ON jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_is_remote         ON jobs (is_remote) WHERE is_remote = true;
CREATE INDEX IF NOT EXISTS idx_jobs_decision_deadline  ON jobs (decision_deadline) WHERE status = 'published';

-- Already exist from earlier migrations (kept here for documentation):
-- idx_jobs_status_created  (status, created_at DESC)
-- idx_jobs_category        (category_id)
-- idx_jobs_city            (city)
-- idx_proposals_job        (job_id)
-- idx_proposals_freelancer (freelancer_id)

-- ---------------------------------------------------------------------------
-- 7. RLS: allow authenticated users to read any profile (marketplace needs it
--    for embedded selects like proposals → profiles.full_name)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 8. RLS: freelancer can withdraw their own pending proposal
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "proposals_update_freelancer_withdraw" ON proposals;
CREATE POLICY "proposals_update_freelancer_withdraw" ON proposals
  FOR UPDATE
  USING  (freelancer_id = auth.uid() AND status = 'pending')
  WITH CHECK (freelancer_id = auth.uid() AND status = 'withdrawn');

-- ---------------------------------------------------------------------------
-- 9. Expiry function (called by cron or manually)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_stale_proposals()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Mark pending proposals on overdue published jobs as expired
  UPDATE proposals
  SET    status = 'expired'
  WHERE  status = 'pending'
  AND    job_id IN (
           SELECT id FROM jobs
           WHERE  decision_deadline < now()
           AND    status = 'published'
         );

  -- Mark overdue published jobs as expired (only if no accepted proposal)
  UPDATE jobs
  SET    status = 'expired'
  WHERE  status = 'published'
  AND    decision_deadline < now()
  AND    NOT EXISTS (
           SELECT 1 FROM proposals p
           WHERE  p.job_id = jobs.id AND p.status = 'accepted'
         );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. pg_cron schedule (uncomment after enabling the extension in Supabase)
-- ---------------------------------------------------------------------------
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'expire-stale-proposals',
--   '0 * * * *',                          -- every hour
--   'SELECT expire_stale_proposals()'
-- );
--
-- Alternative: call expire_stale_proposals() from a Supabase Edge Function
-- triggered on a CRON schedule via supabase/functions.
