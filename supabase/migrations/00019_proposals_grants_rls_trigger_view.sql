-- =============================================================================
-- Proposals: GRANTs, RLS (INSERT with job exists), client_id trigger, v_proposals view
-- =============================================================================

-- 1) Grants for authenticated
GRANT SELECT, INSERT ON public.proposals TO authenticated;
GRANT UPDATE ON public.proposals TO authenticated;

-- 2) Ensure client_id column exists (for trigger to fill)
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.profiles(id);

-- 3) Default status (constraint allows: pending, accepted, rejected, withdrawn, expired)
ALTER TABLE public.proposals ALTER COLUMN status SET DEFAULT 'pending';

-- 4) BEFORE INSERT trigger: set client_id from jobs
CREATE OR REPLACE FUNCTION public.set_proposals_client_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL AND NEW.job_id IS NOT NULL THEN
    SELECT j.client_id INTO NEW.client_id FROM public.jobs j WHERE j.id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_proposals_client_id ON public.proposals;
CREATE TRIGGER trg_set_proposals_client_id
  BEFORE INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_proposals_client_id();

-- 5) RLS (ensure enabled; policies may already exist from 00006/00009)
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

-- INSERT: freelancer only, and job must exist
DROP POLICY IF EXISTS "proposals_insert_freelancer" ON public.proposals;
CREATE POLICY "proposals_insert_freelancer" ON public.proposals
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND freelancer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id)
  );

-- SELECT: freelancer sees own; client sees for their jobs (recreate to be explicit)
DROP POLICY IF EXISTS "proposals_select" ON public.proposals;
CREATE POLICY "proposals_select" ON public.proposals
  FOR SELECT USING (
    freelancer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = proposals.job_id AND j.client_id = auth.uid()
    )
  );

-- UPDATE: client can update (accept/reject); freelancer can withdraw (handled in 00013)
-- policies proposals_update_client and proposals_update_freelancer_withdraw stay as-is

-- 6) View for listanje: p.*, job_title, freelancer_name (no avatar_url)
CREATE OR REPLACE VIEW public.v_proposals AS
SELECT
  p.*,
  j.title AS job_title,
  pr.full_name AS freelancer_name
FROM public.proposals p
JOIN public.jobs j ON j.id = p.job_id
LEFT JOIN public.profiles pr ON pr.id = p.freelancer_id;

GRANT SELECT ON public.v_proposals TO authenticated;

-- Sanity query (run manually if needed):
-- SELECT job_id, freelancer_id, client_id, status FROM public.proposals ORDER BY created_at DESC LIMIT 20;
