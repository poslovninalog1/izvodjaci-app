-- =============================================================================
-- Phase 5: Proposals RLS policies
-- =============================================================================

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- A) INSERT: only authenticated freelancers can insert proposal for themselves
DROP POLICY IF EXISTS "proposals_insert_freelancer" ON proposals;
CREATE POLICY "proposals_insert_freelancer" ON proposals
  FOR INSERT
  WITH CHECK (auth.uid() = freelancer_id);

-- B) SELECT:
--    - freelancer can select own proposals (freelancer_id = auth.uid())
--    - client can select proposals for jobs they own
DROP POLICY IF EXISTS "proposals_select_client" ON proposals;
DROP POLICY IF EXISTS "proposals_select_freelancer" ON proposals;
CREATE POLICY "proposals_select" ON proposals
  FOR SELECT USING (
    freelancer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = proposals.job_id AND jobs.client_id = auth.uid()
    )
  );

-- C) UPDATE: only client who owns the job can update proposal.status
DROP POLICY IF EXISTS "proposals_update_client" ON proposals;
CREATE POLICY "proposals_update_client" ON proposals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = proposals.job_id AND jobs.client_id = auth.uid()
    )
  );
