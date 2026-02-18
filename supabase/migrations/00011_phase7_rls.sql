-- =============================================================================
-- Phase 7: Reviews RLS
-- =============================================================================

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- SELECT: allow anyone to read (public reputation)
DROP POLICY IF EXISTS "reviews_select_public" ON reviews;
CREATE POLICY "reviews_select_public" ON reviews
  FOR SELECT USING (true);

-- INSERT: only participants of completed contract, reviewer_id = auth.uid()
DROP POLICY IF EXISTS "reviews_insert_participants" ON reviews;
CREATE POLICY "reviews_insert_participants" ON reviews
  FOR INSERT WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = contract_id
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
      AND c.status = 'completed'
    )
  );

-- No UPDATE policy: reviews are immutable in MVP
