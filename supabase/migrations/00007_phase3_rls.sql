-- =============================================================================
-- Phase 3: Auth + profiles + jobs RLS tightening
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add onboarding_completed to profiles
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- -----------------------------------------------------------------------------
-- 2. Update trigger: set onboarding_completed=false for new users
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, onboarding_completed)
  VALUES (
    NEW.id,
    'client',  -- default until onboarding sets role
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    false
  );
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Jobs RLS: remove anon insert, require client_id = auth.uid()
-- -----------------------------------------------------------------------------

-- Drop the temporary anon-insert policy
DROP POLICY IF EXISTS "jobs_insert_authenticated" ON jobs;

-- Authenticated clients only: INSERT when client_id = auth.uid()
CREATE POLICY "jobs_insert_client_only" ON jobs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND client_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 4. Profiles: ensure select/update own only (already in 00006, re-assert)
-- -----------------------------------------------------------------------------
-- No change needed; policies from 00006 remain:
-- profiles_select_own, profiles_update_own
