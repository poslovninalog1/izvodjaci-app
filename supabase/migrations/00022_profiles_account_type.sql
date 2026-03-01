-- =============================================================================
-- profiles.account_type for physical/legal entity (required when switching to Izvođač)
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_account_type_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_type_check
      CHECK (account_type IS NULL OR account_type IN ('physical', 'legal'));
  END IF;
END $$;

-- Users can update their own row (existing profiles_update_own allows full row update).
-- No RPC required; frontend uses .update({ account_type }).eq('id', auth.uid()).
