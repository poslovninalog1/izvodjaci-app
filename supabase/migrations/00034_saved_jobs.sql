-- =============================================================================
-- Saved jobs: users can bookmark jobs. Table + RLS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saved_jobs (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id  bigint NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id ON public.saved_jobs (user_id);

ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own saved rows
DROP POLICY IF EXISTS "saved_jobs_select_own" ON public.saved_jobs;
CREATE POLICY "saved_jobs_select_own" ON public.saved_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own saves
DROP POLICY IF EXISTS "saved_jobs_insert_own" ON public.saved_jobs;
CREATE POLICY "saved_jobs_insert_own" ON public.saved_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own saves
DROP POLICY IF EXISTS "saved_jobs_delete_own" ON public.saved_jobs;
CREATE POLICY "saved_jobs_delete_own" ON public.saved_jobs
  FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.saved_jobs TO authenticated;

COMMENT ON TABLE public.saved_jobs IS 'User bookmarks for jobs (Sačuvani poslovi).';
