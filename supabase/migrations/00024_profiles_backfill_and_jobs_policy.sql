-- =============================================================================
-- 00024: (a) Profiles auto-create trigger (idempotent) + backfill missing profiles
--       (b) jobs_select_own_client policy so owner can always select own jobs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Backfill: create profiles for any auth.users that don't have one
--    (e.g. users created before trigger existed, or OAuth without trigger)
-- -----------------------------------------------------------------------------
INSERT INTO public.profiles (id, role, full_name, onboarding_completed)
SELECT
  u.id,
  'client',
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
    ''
  ),
  false
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Trigger on auth.users: auto-create profile on signup (id = auth uid)
--    Use ON CONFLICT so re-run / duplicate trigger fire doesn't fail
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
    'client',
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), NULLIF(trim(NEW.raw_user_meta_data->>'name'), '')),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3. jobs: ensure owner can select own jobs (explicit policy if missing)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "jobs_select_own_client" ON public.jobs;
CREATE POLICY "jobs_select_own_client" ON public.jobs
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND client_id = auth.uid());
