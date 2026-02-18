# Phase 3: Supabase Auth + Profiles + Protected Routes

## Files Created

| File | Purpose |
|------|---------|
| `app/context/AuthContext.tsx` | AuthProvider + useAuth hook (session, user, profile) |
| `app/login/page.tsx` | Login page (email+password) |
| `app/register/page.tsx` | Register page (email+password, full_name) |
| `app/components/LogoutButton.tsx` | Logout button component |
| `supabase/migrations/00007_phase3_rls.sql` | onboarding_completed column, jobs RLS tightening |

## Files Changed

| File | Changes |
|------|---------|
| `app/layout.tsx` | Wrap with AuthProvider |
| `app/page.tsx` | Use useAuth, redirect unauthenticated to /login, check onboarding_completed |
| `app/start/page.tsx` | Require auth (redirect to /login?next=/start), write role to profiles, create freelancer_profiles/client_profiles, set onboarding_completed |
| `app/profil/page.tsx` | Require auth (redirect to /login?next=/profil) |
| `app/jobs/new/page.tsx` | Require auth + role=client, set client_id=user.id, convert from .js |
| `app/components/SidebarTabs.tsx` | Show Login/Register when logged out, Logout when logged in |

## Migration 00007

Run in Supabase SQL Editor:

```sql
-- Add onboarding_completed
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Update trigger
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
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    false
  );
  RETURN NEW;
END;
$$;

-- Jobs: remove anon insert, require client_id = auth.uid()
DROP POLICY IF EXISTS "jobs_insert_authenticated" ON jobs;
CREATE POLICY "jobs_insert_client_only" ON jobs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND client_id = auth.uid());
```

## Supabase Auth Settings

For local testing, ensure in Supabase Dashboard → Authentication → Providers → Email:
- **Confirm email** can be disabled so users are logged in immediately after signup.

## How to Test

### 1) Register → verify profiles row exists

1. Run `npm run dev`, go to http://localhost:3000
2. Click "Registruj se" (or go to /register)
3. Fill: Ime, Email, Lozinka (min 6 chars)
4. Click "Registruj se"
5. In Supabase → Table Editor → **profiles**: confirm a new row with your user id, role='client', onboarding_completed=false

### 2) Onboarding → role saved

1. After register you should land on /start
2. Step 1: Choose "Fizičko lice"
3. Step 2: Choose "Ponuđač" or "Zanatlija"
4. Step 3: Choose a djelatnost
5. Click "Završi"
6. In Supabase → **profiles**: role should be 'client' or 'freelancer', onboarding_completed=true
7. In **client_profiles** or **freelancer_profiles**: new row with your user_id

### 3) /jobs/new as client → works, creates draft with client_id

1. Register + onboard as Ponuđač (client)
2. Go to /jobs/new (or click "Objavi posao")
3. Fill form, submit
4. In Supabase → **jobs**: new row with client_id = your user id, status='draft'

### 4) /jobs/new as freelancer → blocked

1. Register + onboard as Zanatlija (freelancer)
2. Try to go to /jobs/new (manually or via link)
3. You should be redirected to / (home)

### 5) Anon cannot insert jobs; anon sees only published jobs

1. Log out (or use incognito)
2. Try to POST/insert a job via app: you cannot access /jobs/new (redirected to /login)
3. In Supabase SQL Editor, run as anon (or use REST API without auth):
   ```sql
   -- Simulate anon: no session
   SELECT id, title, status FROM jobs;
   ```
   Only rows with status='published' should be visible.
4. Anon insert will fail with RLS (policy requires client_id = auth.uid()).
