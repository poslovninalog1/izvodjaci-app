# Supabase Change Audit Report

**Date:** 2026-02-19  
**Scope:** All database-related changes assumed or introduced after the big feature specification (Search, Inbox, Offers, Contracts, Disputes).  
**Constraint:** Supabase cloud database cannot be modified by the codebase; changes require manually running SQL in the Supabase SQL Editor (or applying migrations yourself).

---

## PHASE 1 — DATABASE CHANGE SUMMARY

### 1. New columns referenced in code

| Column | Table | Introduced in | Exists in cloud? | Exists in repo? | Used in code | Mismatch risk |
|--------|-------|---------------|-------------------|-----------------|--------------|---------------|
| `decision_deadline` | jobs | 00013_decision_flow.sql | **No** (00013 not applied) | Yes | `app/client/jobs/page.tsx` (select), `app/client/jobs/[id]/proposals/page.tsx` (select) | **HIGH** — SELECT fails with 42703 |
| `rejection_reason` | proposals | 00013_decision_flow.sql | **No** | Yes | `app/client/jobs/[id]/proposals/page.tsx` (select, update), `app/freelancer/proposals/page.tsx` (select) | **HIGH** — SELECT/UPDATE fail |
| `status` | jobs | 00002_jobs_migration.sql | Yes | Yes | All job pages (select, filter, update) | None |
| `onboarding_completed` | profiles | 00007_phase3_rls.sql | Unknown | Yes | Not selected in app (AuthContext uses client-derived flag) | Low |
| `deactivated` | profiles | 00012_phase8_admin.sql | Unknown | Yes | Admin + DeactivatedBanner | If missing: runtime errors |
| `is_hidden` | reviews | 00012_phase8_admin.sql | Unknown | Yes | Admin, izvodjac profile, contracts | If missing: runtime errors |

### 2. New status values introduced in code

| Value | Table | Constraint source | Allowed in cloud? | Used in code | Mismatch risk |
|-------|-------|-------------------|-------------------|--------------|---------------|
| `pending` | proposals | 00013 only: `CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'expired'))` | **No** (current: submitted, shortlisted, rejected, hired) | Client proposals filter `.eq("status", "pending")`, freelancer withdraw → `withdrawn` | **HIGH** — INSERT/UPDATE 23514 |
| `accepted` | proposals | 00013 | **No** | Client proposals: accept → `accepted` | **HIGH** |
| `withdrawn` | proposals | 00013 | **No** | Freelancer proposals: withdraw | **HIGH** |
| `expired` | proposals | 00013 | **No** | Expiry function (00013) | N/A until 00013 applied |
| `closed` | jobs | 00002: `CHECK (status IN ('draft', 'published', 'closed'))` | **Yes** | Client proposals: close job | None |
| `expired` | jobs | 00013: adds to CHECK | **No** (current CHECK has no 'expired') | UI badges, 00013 trigger | **MEDIUM** — UPDATE would fail if code set status='expired' before 00013 |
| `published` | jobs | 00002 | Yes | Listing filter, detail page | None |

### 3. CHECK constraints assumed

| Constraint | Table | In repo | In cloud (if 00001–00012 applied) | In cloud (if 00013 applied) | Mismatch risk |
|------------|--------|---------|-----------------------------------|-----------------------------|---------------|
| jobs_status_check | jobs | 00002: draft, published, closed. 00013: + expired | draft, published, closed | draft, published, closed, expired | Code that sets job status = 'expired' fails without 00013 |
| proposals_status_check | proposals | 00003: submitted, shortlisted, rejected, hired. 00013: pending, accepted, rejected, withdrawn, expired | submitted, shortlisted, rejected, hired | pending, accepted, rejected, withdrawn, expired | **HIGH** — current code uses pending/accepted/withdrawn/rejected; 00013 also backfills submitted→pending, hired→accepted |
| proposals_rejection_reason_required | proposals | 00013: status='rejected' ⇒ rejection_reason NOT NULL and != '' | N/A | Exists after 00013 | If 00013 applied, reject without reason fails |
| jobs_budget_type_check | jobs | 00002 | fixed, hourly | same | None |

### 4. Foreign key relationships assumed

| Relationship | From | To | In repo | Used in code | Mismatch risk |
|--------------|------|-----|---------|--------------|---------------|
| jobs.client_id | jobs | profiles(id) | 00002 | RLS, ownership | None |
| jobs.category_id | jobs | categories(id) | 00002 | Select categories(name) by category_id; filter by category_id | None (FK exists in 00002) |
| jobs.city | — | — | Text column, no FK to cities | Filter by city name string | None |
| proposals.job_id | proposals | jobs(id) | 00003 | All proposal queries | None |
| proposals.freelancer_id | proposals | profiles(id) | 00003 | RLS, embed profiles(full_name) | **PGRST200 risk**: embed requires RLS to allow reading other profiles; 00006 = own only, 00013 = authenticated read all |
| contracts.job_id | contracts | jobs(id) | 00003 | — | None |
| contracts.client_id / freelancer_id | contracts | profiles(id) | 00003 | — | None |
| conversations.contract_id | conversations | contracts(id) | 00003 | Inbox, client flow | None |
| messages.conversation_id | messages | conversations(id) | 00003 | — | None |
| reviews.contract_id, reviewer_id, reviewee_id | reviews | contracts, profiles | 00003 | — | None |

### 5. RLS policies assumed or changed

| Policy | Table | In repo (migration) | Effect if not in cloud | Used in code |
|--------|-------|---------------------|-------------------------|--------------|
| profiles_select_own | profiles | 00006 | Users can only read own profile | AuthContext, profil, start |
| profiles_select_authenticated | profiles | **00013 only** | N/A until 00013 | **Client proposals page** `proposals(..., profiles(full_name))` — client must read freelancer profile; with only select_own, client gets RLS denial → PGRST200 or null embed |
| profiles_select_admin | profiles | 00012 | Admin panel cannot list profiles | admin/page.tsx |
| profiles_update_own / update_admin_deactivated | profiles | 00006, 00012 | — | start, admin |
| jobs_select_published, jobs_select_admin | jobs | 00006, 00012 | — | Listing, admin |
| jobs_insert_client_only | jobs | 00007 | — | jobs/new |
| jobs_update_own, jobs_update_admin | jobs | 00006, 00012 | — | Client proposals (close job), admin |
| proposals_select | proposals | 00009 | Freelancer + job owner can read | All proposal pages |
| proposals_insert_freelancer | proposals | 00009 | — | ProposalForm |
| proposals_update_client | proposals | 00009 | — | Client accept/reject |
| proposals_update_freelancer_withdraw | proposals | **00013 only** | Freelancer cannot set status to withdrawn (no policy allows it for freelancer) | Freelancer proposals withdraw button |

### 6. Indexes assumed

| Index | Table | In repo | Used implicitly by code |
|-------|--------|---------|---------------------------|
| idx_jobs_status_created | jobs | 00002 | Listing order + status filter |
| idx_jobs_category | jobs | 00002 | Category filter |
| idx_jobs_city | jobs | 00002 | City filter |
| idx_jobs_created_at_desc | jobs | 00013 | Listing newest |
| idx_jobs_is_remote | jobs | 00013 | Remote filter |
| idx_jobs_decision_deadline | jobs | 00013 | Expiry function (00013) |
| idx_proposals_job | proposals | 00003 | Proposals by job |
| idx_proposals_freelancer | proposals | 00003 | Freelancer proposals page |
| Others (contracts, messages, reviews, reports) | — | 00003, 00012 | Various |

If 00013 is not applied, the extra indexes (created_at_desc, is_remote, decision_deadline) do not exist; queries still work, just potentially slower.

### 7. Triggers / functions

| Name | Migration | Purpose | Exists in cloud? |
|------|-----------|---------|-------------------|
| on_auth_user_created → handle_new_user() | 00005, 00007 | Create profile on signup | Yes (if 00005/00007 applied) |
| set_job_decision_deadline | **00013 only** | Set decision_deadline on INSERT when status=published | **No** |
| expire_stale_proposals() | **00013 only** | Mark overdue proposals/jobs expired | **No** |

### 8. Cron jobs

| Item | Where | Status |
|------|--------|--------|
| pg_cron schedule for expire_stale_proposals | 00013 (commented out) | Not created; optional. Run manually or via Edge Function + cron. |

### 9. Storage buckets

| Bucket | Referenced in | Notes |
|--------|----------------|-------|
| None in Next.js app | — | No Supabase Storage buckets are used in the main Izvodjaci app. |
| contracts-module | contracts-module (S3/MinIO) | Standalone module uses S3-compatible storage, not Supabase Storage. |

---

## PHASE 2 — MIGRATION STATUS

You must confirm which migrations have been run in the Supabase Dashboard (SQL Editor history or Migration history). Below: what each file does. **“Applied to cloud?” is unknown for 00001–00012** (assume applied if the app ever worked); **00013 is NOT applied** unless you ran it manually.

| Migration | Applied to cloud? | Tables / objects modified | Status enums / CHECK changes |
|-----------|-------------------|---------------------------|------------------------------|
| 00001_profiles_and_core.sql | Unknown | categories, cities, profiles, freelancer_profiles, client_profiles | — |
| 00002_jobs_migration.sql | Unknown | jobs (columns: city, client_id, category_id, budget_type, budget_min, is_remote, skills, status, created_at); indexes | jobs_status_check: draft, published, closed. jobs_budget_type_check. |
| 00003_marketplace_tables.sql | Unknown | proposals, contracts, conversations, messages, reviews, reports, admin_actions | proposals_status_check: submitted, shortlisted, rejected, hired. contracts, reviews CHECKs. |
| 00004_seed_cities_categories.sql | Unknown | categories, cities (seed data) | — |
| 00005_auth_trigger.sql | Unknown | auth trigger, handle_new_user() | — |
| 00006_rls.sql | Unknown | RLS on all main tables | — |
| 00007_phase3_rls.sql | Unknown | profiles (onboarding_completed), handle_new_user(), jobs INSERT policy | — |
| 00009_phase5_rls.sql | Unknown | proposals RLS (select, insert, update) | — |
| 00010_phase6_rls.sql | Unknown | contracts, conversations, messages RLS | — |
| 00011_phase7_rls.sql | Unknown | reviews RLS | — |
| 00012_phase8_admin.sql | Unknown | profiles.deactivated, reviews.is_hidden; reports/admin RLS; admin SELECT/UPDATE policies | — |
| **00013_decision_flow.sql** | **No** (created in repo, not run on cloud) | jobs (decision_deadline, status CHECK), proposals (rejection_reason, status CHECK, rejection_reason CHECK), trigger set_job_decision_deadline, function expire_stale_proposals(), profiles_select_authenticated, proposals_update_freelancer_withdraw, indexes | jobs: + expired. proposals: submitted/shortlisted→pending, hired→accepted; new set pending, accepted, rejected, withdrawn, expired. |

---

## PHASE 3 — PASSWORD & POSTGRES CHANGES

1. **Why you were asked to reset the database password**  
   The **contracts-module** (separate Node/Prisma service) needs a `DATABASE_URL` in its `.env`. You were asked to set `DATABASE_URL=...TVOJ_PASSWORD...@127.0.0.1:5432/...` so that:
   - Either the contracts-module connects to **local PostgreSQL** (your machine), or  
   - You replace that URL with the **Supabase project’s connection string** (from Supabase Dashboard → Project Settings → Database → Connection string, with the database password you set in Supabase).

2. **Why install PostgreSQL or “MCP server”?**  
   The instructions did not require installing an “MCP server.” They did require:
   - **PostgreSQL** if you run the contracts-module against a **local** database (e.g. `127.0.0.1:5432`).  
   - No extra install if you point the contracts-module at **Supabase** (same DB as the Next.js app).

3. **Did those actions modify Supabase cloud?**  
   **No.** Changing a local `.env` file or installing PostgreSQL on your machine does not change the Supabase cloud database. Supabase cloud only changes when you run SQL in the Supabase SQL Editor (or run migrations that execute against the cloud DB).

4. **Is the cloud database state changed because of those steps?**  
   **No.** Cloud state only changes when you apply migrations (e.g. paste and run 00013 in the SQL Editor).

5. **Was the password change necessary for functionality or only for MCP?**  
   The **contracts-module** needs a valid `DATABASE_URL` to run Prisma (migrate, run server). That password is for:
   - **Local Postgres:** the `postgres` user password on your machine.  
   - **Supabase:** the database password from Project Settings → Database.  
   It is for **database connectivity**, not for “MCP” or Cursor-specific features.

---

## PHASE 4 — SCHEMA VS CODE MISMATCH

Assumption: **00001–00012 are applied** to cloud; **00013 is not**.

| # | Mismatch | Code expectation | Current cloud (without 00013) | Result |
|---|----------|-------------------|-------------------------------|--------|
| 1 | Column missing | jobs.decision_deadline in SELECT | Column does not exist | PostgreSQL 42703, request fails; page can show error or “not found” |
| 2 | Column missing | proposals.rejection_reason in SELECT/UPDATE | Column does not exist | 42703 on select; 42703 on update |
| 3 | Invalid enum | proposals.status = 'pending' (insert in ProposalForm) | CHECK allows only submitted, shortlisted, rejected, hired | 23514 constraint violation (we reverted to "submitted" in job detail ProposalForm) |
| 4 | Invalid enum | proposals.status = 'accepted' / 'rejected' / 'withdrawn' in client/freelancer pages | Same CHECK | 23514 on update |
| 5 | Invalid enum | .eq("status", "pending") in client proposals | No row has status 'pending' (data still submitted/hired/etc.) | Filter returns no rows; logic wrong |
| 6 | RLS | Client reads proposals with profiles(full_name) | profiles_select_own only (00006) | Client cannot read freelancer profile → PGRST200 or null embed |
| 7 | Policy missing | Freelancer updates proposal to status = 'withdrawn' | Only proposals_update_client (job owner) | Freelancer UPDATE denied by RLS |
| 8 | Job status | jobs.status = 'closed' | Allowed by 00002 CHECK | OK |
| 9 | Job status | jobs.status = 'expired' | Not in 00002 CHECK | If code ever sets it before 00013: 23514 |

---

## PHASE 5 — CLEAN STATE PLAN

### Option A — Revert code to current Supabase schema (no migration 00013 applied)

- **Remove** from code any use of:
  - `decision_deadline` (jobs): remove from SELECT in `app/client/jobs/page.tsx` and `app/client/jobs/[id]/proposals/page.tsx`.
  - `rejection_reason` (proposals): remove from SELECT and from all `.update({ ..., rejection_reason })` in client and freelancer proposals pages.
- **Proposal statuses:** use only values allowed by current CHECK: `submitted`, `shortlisted`, `rejected`, `hired`.
  - Client “accept” flow: set proposal to `hired` (not `accepted`); do not set others to `rejected` with a reason (no column); optionally set job to `closed`.
  - Freelancer “withdraw”: either remove the feature or implement via a separate “withdrawn” flag column only after adding it in a migration (current CHECK has no `withdrawn`).
- **Embedded select:** avoid `profiles(full_name)` in proposals when the viewer is the client (RLS blocks). Fetch freelancer names in a separate query by `freelancer_id` list and join in the frontend, or add a server/API that runs with elevated permissions.
- **ProposalForm:** keep `status: "submitted"` on insert (already reverted in current code).
- **Job detail page:** keep NOT selecting `decision_deadline` (already fixed in current code).
- **Client jobs list:** remove `decision_deadline` from SELECT and from any deadline UI.
- **Client proposals page:** stop selecting/updating `rejection_reason`; stop using status `pending`/`accepted`/`withdrawn`; use `submitted`/`shortlisted`/`rejected`/`hired` and no rejection_reason.
- **Freelancer proposals page:** stop selecting `rejection_reason`; remove “withdraw” or implement without changing status to `withdrawn` until schema allows it.

Result: app matches current cloud schema (00001–00012, no 00013).

---

### Option B — Exact SQL to apply to Supabase to match current code

Run the following in **Supabase SQL Editor** (in order). This is the content of **00013_decision_flow.sql** with one syntax fix (PostgreSQL uses `EXECUTE PROCEDURE` in older versions; Supabase supports `EXECUTE FUNCTION`).

```sql
-- =============================================================================
-- Phase 9: Decision flow — deadline, rejection reason, status migration, expiry
-- =============================================================================

-- 1. New columns
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS decision_deadline timestamptz;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 2. Migrate existing proposal statuses BEFORE changing constraints
UPDATE proposals SET status = 'pending'  WHERE status IN ('submitted', 'shortlisted');
UPDATE proposals SET status = 'accepted' WHERE status = 'hired';
UPDATE proposals SET rejection_reason = 'Ponuda je odbijena.'
WHERE status = 'rejected' AND (rejection_reason IS NULL OR rejection_reason = '');

-- 3. Update CHECK constraints
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('draft', 'published', 'closed', 'expired'));

ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'expired'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_rejection_reason_required'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_rejection_reason_required
      CHECK (status != 'rejected' OR (rejection_reason IS NOT NULL AND rejection_reason != ''));
  END IF;
END $$;

-- 4. Set decision_deadline for existing published jobs
UPDATE jobs SET decision_deadline = created_at + interval '7 days'
WHERE status = 'published' AND decision_deadline IS NULL;

-- 5. Trigger: auto-set decision_deadline on INSERT (published jobs)
CREATE OR REPLACE FUNCTION set_job_decision_deadline()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.decision_deadline IS NULL AND NEW.status = 'published' THEN
    NEW.decision_deadline := COALESCE(NEW.created_at, now()) + interval '7 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_decision_deadline ON jobs;
CREATE TRIGGER trg_set_decision_deadline
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_job_decision_deadline();

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_created_at_desc ON jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_is_remote ON jobs (is_remote) WHERE is_remote = true;
CREATE INDEX IF NOT EXISTS idx_jobs_decision_deadline ON jobs (decision_deadline) WHERE status = 'published';

-- 7. RLS: authenticated users can read any profile (for proposals → profiles(full_name))
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 8. RLS: freelancer can withdraw own pending proposal
DROP POLICY IF EXISTS "proposals_update_freelancer_withdraw" ON proposals;
CREATE POLICY "proposals_update_freelancer_withdraw" ON proposals
  FOR UPDATE
  USING  (freelancer_id = auth.uid() AND status = 'pending')
  WITH CHECK (freelancer_id = auth.uid() AND status = 'withdrawn');

-- 9. Expiry function (optional: call from cron or Edge Function)
CREATE OR REPLACE FUNCTION expire_stale_proposals()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE proposals SET status = 'expired'
  WHERE status = 'pending'
  AND job_id IN (
    SELECT id FROM jobs
    WHERE decision_deadline < now() AND status = 'published'
  );
  UPDATE jobs SET status = 'expired'
  WHERE status = 'published'
  AND decision_deadline < now()
  AND NOT EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.job_id = jobs.id AND p.status = 'accepted'
  );
END;
$$;
```

**Note:** If your Supabase Postgres version does not accept `EXECUTE FUNCTION`, replace that line with:

```sql
  FOR EACH ROW EXECUTE PROCEDURE set_job_decision_deadline();
```

After this, cloud schema matches the code that uses `decision_deadline`, `rejection_reason`, and statuses `pending`/`accepted`/`withdrawn`/`expired`. You can then switch ProposalForm back to `status: "pending"` if desired and re-enable deadline display on the job detail page.

---

## AUDIT TABLE (SUMMARY)

| Item | Exists in cloud | Exists in repo | Used in code | Mismatch risk |
|------|-----------------|----------------|--------------|---------------|
| jobs.decision_deadline | No (00013) | Yes (00013) | Client jobs list, client proposals page | HIGH |
| proposals.rejection_reason | No (00013) | Yes (00013) | Client/freelancer proposals | HIGH |
| jobs.status = expired | No (00013) | Yes (00013) | UI, expiry function | MEDIUM |
| proposals.status pending/accepted/withdrawn/expired | No (00013) | Yes (00013) | Client + freelancer flows | HIGH |
| profiles_select_authenticated | No (00013) | Yes (00013) | proposals → profiles(full_name) | HIGH (PGRST200) |
| proposals_update_freelancer_withdraw | No (00013) | Yes (00013) | Freelancer withdraw | HIGH |
| set_job_decision_deadline trigger | No (00013) | Yes (00013) | New jobs | LOW until 00013 |
| expire_stale_proposals() | No (00013) | Yes (00013) | Optional cron | N/A |
| jobs.status draft/published/closed | Yes (00002) | Yes | Everywhere | None |
| proposals status submitted/hired/rejected/shortlisted | Yes (00003) | Yes (00003); 00013 migrates away | ProposalForm insert "submitted" | None if 00013 not applied |
| categories(id), cities(id) | Yes (00001) | Yes | Jobs filters, job detail | None |
| contracts, conversations, messages, reviews | Yes (00003) | Yes | Inbox, contracts, client flow | None |
