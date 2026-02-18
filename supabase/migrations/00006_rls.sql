-- =============================================================================
-- Phase 2: Row Level Security (RLS) policies
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Allow insert from trigger (SECURITY DEFINER) - no policy needed for insert from trigger
-- Allow users to read their own profile on insert (handled by trigger)

-- -----------------------------------------------------------------------------
-- freelancer_profiles, client_profiles
-- -----------------------------------------------------------------------------
ALTER TABLE freelancer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "freelancer_profiles_select" ON freelancer_profiles;
CREATE POLICY "freelancer_profiles_select" ON freelancer_profiles
  FOR SELECT USING (true);  -- public profiles for directory

DROP POLICY IF EXISTS "freelancer_profiles_all_own" ON freelancer_profiles;
CREATE POLICY "freelancer_profiles_all_own" ON freelancer_profiles
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "client_profiles_select" ON client_profiles;
CREATE POLICY "client_profiles_select" ON client_profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "client_profiles_all_own" ON client_profiles;
CREATE POLICY "client_profiles_all_own" ON client_profiles
  FOR ALL USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- jobs
-- -----------------------------------------------------------------------------
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_select_published" ON jobs;
CREATE POLICY "jobs_select_published" ON jobs
  FOR SELECT USING (
    status = 'published'
    OR (auth.uid() IS NOT NULL AND client_id = auth.uid())
  );

-- Temporary: allow anon insert until Phase 3 auth. TODO: change to (auth.uid() IS NOT NULL)
DROP POLICY IF EXISTS "jobs_insert_authenticated" ON jobs;
CREATE POLICY "jobs_insert_authenticated" ON jobs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "jobs_update_own" ON jobs;
CREATE POLICY "jobs_update_own" ON jobs
  FOR UPDATE USING (client_id = auth.uid());

DROP POLICY IF EXISTS "jobs_delete_own" ON jobs;
CREATE POLICY "jobs_delete_own" ON jobs
  FOR DELETE USING (client_id = auth.uid());

-- -----------------------------------------------------------------------------
-- proposals
-- -----------------------------------------------------------------------------
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposals_select_client" ON proposals;
CREATE POLICY "proposals_select_client" ON proposals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = proposals.job_id AND jobs.client_id = auth.uid()
    )
    OR freelancer_id = auth.uid()
  );

DROP POLICY IF EXISTS "proposals_insert_freelancer" ON proposals;
CREATE POLICY "proposals_insert_freelancer" ON proposals
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND freelancer_id = auth.uid()
  );

DROP POLICY IF EXISTS "proposals_update_client" ON proposals;
CREATE POLICY "proposals_update_client" ON proposals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = proposals.job_id AND jobs.client_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- contracts
-- -----------------------------------------------------------------------------
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_select_participants" ON contracts;
CREATE POLICY "contracts_select_participants" ON contracts
  FOR SELECT USING (
    client_id = auth.uid() OR freelancer_id = auth.uid()
  );

DROP POLICY IF EXISTS "contracts_insert_client" ON contracts;
CREATE POLICY "contracts_insert_client" ON contracts
  FOR INSERT WITH CHECK (client_id = auth.uid());

DROP POLICY IF EXISTS "contracts_update_participants" ON contracts;
CREATE POLICY "contracts_update_participants" ON contracts
  FOR UPDATE USING (
    client_id = auth.uid() OR freelancer_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------------
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_participants" ON conversations;
CREATE POLICY "conversations_select_participants" ON conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = conversations.contract_id
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "conversations_insert_participants" ON conversations;
CREATE POLICY "conversations_insert_participants" ON conversations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = conversations.contract_id
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_participants" ON messages;
CREATE POLICY "messages_select_participants" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations conv
      JOIN contracts c ON c.id = conv.contract_id
      WHERE conv.id = messages.conversation_id
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_insert_participants" ON messages;
CREATE POLICY "messages_insert_participants" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations conv
      JOIN contracts c ON c.id = conv.contract_id
      WHERE conv.id = messages.conversation_id
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- reviews
-- -----------------------------------------------------------------------------
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_select_public" ON reviews;
CREATE POLICY "reviews_select_public" ON reviews
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "reviews_insert_participants" ON reviews;
CREATE POLICY "reviews_insert_participants" ON reviews
  FOR INSERT WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = reviews.contract_id
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
      AND c.status = 'completed'
    )
  );

-- -----------------------------------------------------------------------------
-- reports
-- -----------------------------------------------------------------------------
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_insert_authenticated" ON reports;
CREATE POLICY "reports_insert_authenticated" ON reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "reports_select_own" ON reports;
CREATE POLICY "reports_select_own" ON reports
  FOR SELECT USING (reporter_id = auth.uid());

-- -----------------------------------------------------------------------------
-- admin_actions (admin only - add when admin role is checked)
-- -----------------------------------------------------------------------------
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_actions_admin_only" ON admin_actions;
CREATE POLICY "admin_actions_admin_only" ON admin_actions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- categories, cities (public read)
-- -----------------------------------------------------------------------------
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select_all" ON categories;
CREATE POLICY "categories_select_all" ON categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "cities_select_all" ON cities;
CREATE POLICY "cities_select_all" ON cities
  FOR SELECT USING (true);
