-- =============================================================================
-- Phase 8: Admin moderation + Reports RLS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Add columns
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated boolean DEFAULT false;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;

-- -----------------------------------------------------------------------------
-- B) Reports RLS
-- -----------------------------------------------------------------------------
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- INSERT: any authenticated user (reporter_id = auth.uid())
DROP POLICY IF EXISTS "reports_insert_authenticated" ON reports;
CREATE POLICY "reports_insert_authenticated" ON reports
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND reporter_id = auth.uid()
  );

-- SELECT: admin can select all; normal users can select their own
DROP POLICY IF EXISTS "reports_select_own" ON reports;
CREATE POLICY "reports_select_own" ON reports
  FOR SELECT USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "reports_select_admin" ON reports;
CREATE POLICY "reports_select_admin" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- C) Admin SELECT permissions (jobs, profiles)
-- -----------------------------------------------------------------------------

-- jobs: admin can select all (for admin panel)
DROP POLICY IF EXISTS "jobs_select_admin" ON jobs;
CREATE POLICY "jobs_select_admin" ON jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- profiles: admin can select all (for admin panel)
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- D) Admin update permissions
-- -----------------------------------------------------------------------------

-- profiles: admin can update deactivated on any row (keep existing self-update)
DROP POLICY IF EXISTS "profiles_update_admin_deactivated" ON profiles;
CREATE POLICY "profiles_update_admin_deactivated" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- jobs: admin can update status to closed
DROP POLICY IF EXISTS "jobs_update_admin" ON jobs;
CREATE POLICY "jobs_update_admin" ON jobs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- reviews: admin can update is_hidden
DROP POLICY IF EXISTS "reviews_update_admin" ON reviews;
CREATE POLICY "reviews_update_admin" ON reviews
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
