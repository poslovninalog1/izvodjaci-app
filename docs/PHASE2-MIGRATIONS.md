# Phase 2: Data Model + Migrations + Seed

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/00001_profiles_and_core.sql` | profiles, categories, cities, freelancer_profiles, client_profiles |
| `supabase/migrations/00002_jobs_migration.sql` | ALTER jobs (rename municipality→city, add columns) |
| `supabase/migrations/00003_marketplace_tables.sql` | proposals, contracts, conversations, messages, reviews, reports, admin_actions |
| `supabase/migrations/00004_seed_cities_categories.sql` | Seed cities + categories |
| `supabase/migrations/00005_auth_trigger.sql` | Trigger: create profile on auth.users insert |
| `supabase/migrations/00006_rls.sql` | Row Level Security policies |

## How to Apply in Supabase

### Option A: Supabase SQL Editor (manual)

1. Open your Supabase project → **SQL Editor**.
2. Run each migration file **in order** (00001 → 00002 → … → 00006).
3. Copy-paste the contents of each file and click **Run**.

### Option B: Supabase CLI

```bash
# Install Supabase CLI if needed: npm i -g supabase
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Or run migrations individually:

```bash
supabase db execute -f supabase/migrations/00001_profiles_and_core.sql
supabase db execute -f supabase/migrations/00002_jobs_migration.sql
supabase db execute -f supabase/migrations/00003_marketplace_tables.sql
supabase db execute -f supabase/migrations/00004_seed_cities_categories.sql
supabase db execute -f supabase/migrations/00005_auth_trigger.sql
supabase db execute -f supabase/migrations/00006_rls.sql
```

## Sanity Test

### 1. Create a job

1. Run `npm run dev`.
2. Go to `/start`, complete onboarding (choose Ponuđač).
3. Go to `/jobs/new`.
4. Fill: Naziv posla, Opis, select Kategorija, select Grad, Budžet max.
5. Click **Sačuvaj**.
6. You should see: "Saved! Provjeri Supabase -> Table Editor -> jobs."

### 2. Query jobs in Supabase

1. Supabase → **Table Editor** → **jobs**.
2. Confirm the new row has: title, description, city, budget_max, budget_type, status, category_id, etc.

### 3. RLS behavior (anon can only read published)

1. In Supabase **SQL Editor**, run:

```sql
-- As anon (no auth), only published jobs should be visible
SELECT id, title, status FROM jobs;
```

2. With RLS enabled, anon users see only rows where `status = 'published'`.
3. Draft jobs (status = 'draft') are hidden from anon.
4. To verify: create a job (it saves as draft). Query as anon — it should not appear. Publish it (update status to 'published'), then anon can see it.

### 4. Seed data

```sql
SELECT * FROM cities ORDER BY sort_order;
SELECT * FROM categories ORDER BY sort_order;
```

You should see 10 cities and 12 categories.

## Notes

- **Jobs insert**: RLS currently allows anon insert (temporary) until Phase 3 auth. Policy in `00006_rls.sql` has a TODO.
- **client_id**: Nullable until auth is implemented. App sets it when `supabase.auth.getUser()` returns a user.
- **municipality → city**: Migration renames the column. App now uses `city` and a cities dropdown.
