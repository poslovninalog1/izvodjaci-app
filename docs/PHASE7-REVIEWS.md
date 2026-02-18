# Phase 7: Reviews + Reputation

## Files Created

| File | Purpose |
|------|---------|
| `app/contracts/[id]/ReviewForm.tsx` | Review form: rating 1–5, text (optional, max 500); handles unique constraint |
| `app/izvodjac/[id]/page.tsx` | Public freelancer profile: name, city, title, skills, bio, hourly_rate; avg rating, count, last 5 reviews |
| `app/klijent/[id]/page.tsx` | Minimal client public profile: name, company, city; avg rating, count |
| `supabase/migrations/00011_phase7_rls.sql` | Reviews RLS: SELECT public, INSERT participants only, no UPDATE |
| `docs/PHASE7-REVIEWS.md` | Phase 7 notes and test steps |

## Files Changed

| File | Changes |
|------|---------|
| `app/contracts/[id]/page.tsx` | Added ReviewForm when contract.status === 'completed' |
| `app/client/jobs/[id]/proposals/page.tsx` | Freelancer name links to /izvodjac/[freelancer_id] |

## Migration 00011_phase7_rls.sql

```sql
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
      WHERE c.id = contract_id
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
      AND c.status = 'completed'
    )
  );
```

## How to Test

### 1) Complete contract

1. Client opens /contracts/[id], clicks "Označi kao završeno".
2. Status → completed.

### 2) Both sides leave review

1. Client: "Ostavi ocjenu" section appears; rate freelancer (1–5), optional text, submit.
2. Freelancer: same for client.
3. Unique constraint: try to submit again → "Već si ostavio ocjenu za ovaj ugovor."

### 3) Freelancer public profile shows avg + list

1. Go to /izvodjac/[freelancer_id] (e.g. from proposals link).
2. See name, city, title, skills, bio, hourly_rate.
3. See avg rating, count, last 5 reviews.

### 4) Non-participant cannot insert review

1. Log in as user who is not client or freelancer on the contract.
2. Attempt to POST a review via API or app → RLS blocks insert.
