# Phase 4: Marketplace Jobs Browsing and Management

## Files Created

| File | Purpose |
|------|---------|
| `app/jobs/page.tsx` | Public jobs listing: search, filters (category, city, remote, budget type), sort (newest, budget high→low), pagination (12/page) |
| `app/jobs/[id]/page.tsx` | Job detail: title, description, category, city/remote, budget, skills, posted date; Publish/Close for owner; "Pošalji ponudu" for freelancer |
| `app/client/jobs/page.tsx` | Client dashboard: all jobs where client_id = auth.uid(); columns: title, status, created_at; actions: Publish, Close, View |

## Files Changed

| File | Changes |
|------|---------|
| `app/components/SidebarTabs.tsx` | Added "Poslovi" (/jobs); "Moji poslovi" (/client/jobs) for clients; "Pronađi poslove" label for freelancers on /jobs link |

## How to Test

### 1) Guest browsing jobs

1. Log out (or use incognito).
2. Go to http://localhost:3000/jobs
3. You should see only **published** jobs (drafts/closed are hidden by RLS).
4. Try search, filters (category, city, remote, budget type), sort, pagination.

### 2) Client publishing job

1. Log in as a client (Ponuđač).
2. Go to /jobs/new, create a job (it saves as draft).
3. Go to /client/jobs — you should see the new job with status "Nacrt".
4. Click "Objavi" or go to /jobs/[id] and click "Objavi posao".
5. Status should change to "Objavljeno".

### 3) Job visible publicly after publish

1. After publishing, log out (or open incognito).
2. Go to /jobs
3. The job should appear in the list.
4. Click it to open the job detail page.
