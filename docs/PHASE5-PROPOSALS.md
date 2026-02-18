# Phase 5: Proposals (Ponude) End-to-End

## Files Created

| File | Purpose |
|------|---------|
| `app/jobs/[id]/ProposalForm.tsx` | Proposal submission form: cover_letter (min 50), proposed_fixed/proposed_rate by budget_type; handles unique constraint |
| `app/freelancer/proposals/page.tsx` | Freelancer dashboard: list proposals with job title, status, price, date |
| `app/client/jobs/[id]/proposals/page.tsx` | Client view: proposals for a job; freelancer name, cover letter preview, price, status; Shortlist/Reject/Hire |
| `supabase/migrations/00009_phase5_rls.sql` | Proposals RLS: INSERT freelancer only; SELECT own or client's jobs; UPDATE client only |
| `docs/PHASE5-PROPOSALS.md` | Phase 5 notes and test steps |

## Files Changed

| File | Changes |
|------|---------|
| `app/jobs/[id]/page.tsx` | ProposalForm for freelancers; proposal count + link for owner; login prompt for guests |
| `app/client/jobs/page.tsx` | "Ponude" link per job |
| `app/components/SidebarTabs.tsx` | "Moje ponude" for freelancers |

## Migration 00009_phase5_rls.sql

```sql
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposals_insert_freelancer" ON proposals;
CREATE POLICY "proposals_insert_freelancer" ON proposals
  FOR INSERT
  WITH CHECK (auth.uid() = freelancer_id);

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

DROP POLICY IF EXISTS "proposals_update_client" ON proposals;
CREATE POLICY "proposals_update_client" ON proposals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = proposals.job_id AND jobs.client_id = auth.uid()
    )
  );
```

## How to Test

### 1) Freelancer submits proposal on published job

1. Log in as freelancer (Zanatlija).
2. Go to /jobs, open a published job.
3. Fill form: cover letter (min 50 chars), proposed price (fixed or hourly).
4. Submit → success message + link to "Moje ponude".

### 2) Freelancer sees it in /freelancer/proposals

1. After submitting, go to /freelancer/proposals (or click "Moje ponude").
2. Proposal appears with job title, status "Poslato", price, date.

### 3) Client opens /client/jobs/[id]/proposals and sees proposal

1. Log in as client (owner of the job).
2. Go to /client/jobs → click "Ponude" on the job, or from job detail click "Ponude (N)".
3. Proposal list shows freelancer name, cover letter preview, price, status badge.

### 4) Client shortlist/reject/hire changes status

1. On proposals page, click "Uži izbor" → status → "U užem izboru".
2. Click "Odbij" → status → "Odbijeno".
3. Click "Angažuj" → status → "Angažovan".

### 5) RLS verification

- **Anon**: Cannot read proposals (no matching SELECT policy).
- **Freelancer**: Can read only own proposals.
- **Client**: Can read only proposals for jobs they own.
