# Phase 1: Codebase Audit — Izvodjaci Marketplace

**Date:** 2025-02-15  
**Scope:** Full repository scan for Upwork-style marketplace conversion

---

## 1. Repository Structure

```
izvodjaci/
├── app/
│   ├── components/
│   │   └── SidebarTabs.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx              # Home dashboard (post-onboarding)
│   ├── start/
│   │   └── page.tsx          # Onboarding flow
│   ├── profil/
│   │   └── page.tsx          # Profile placeholder
│   └── jobs/
│       └── new/
│           └── page.js       # Create job form
├── src/
│   └── lib/
│       └── supabaseClient.js
├── package.json
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
└── .env.local                # Supabase URL + anon key
```

---

## 2. Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Framework** | Next.js (App Router) | 16.1.1 |
| **React** | React | 19.2.3 |
| **Backend/DB** | Supabase (PostgreSQL + REST) | @supabase/supabase-js ^2.89.0 |
| **Styling** | Tailwind CSS 4 + custom CSS | @tailwindcss/postcss ^4 |
| **Routing** | File-based (app directory) | — |
| **State** | React useState + localStorage | — |
| **ORM** | None (direct Supabase client) | — |

---

## 3. Routing

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Home dashboard (redirects to /start if no onboarding) |
| `/start` | `app/start/page.tsx` | Onboarding: account type → role → activity |
| `/profil` | `app/profil/page.tsx` | Profile placeholder |
| `/jobs/new` | `app/jobs/new/page.js` | Create job form (inserts to Supabase) |

**Broken/404 routes** (sidebar links, no page files):
- `/iskustva` — Iskustva
- `/ocjene-izvodjaca` — Ocjene zanatlija
- `/ocjene-ponuda` — Ocjene ponuda
- `/krediti` — Krediti i plaćanja

---

## 4. Auth Implementation

| Aspect | Current State |
|--------|---------------|
| **Auth provider** | None |
| **Login/Register** | Not implemented |
| **Session** | None |
| **User identity** | localStorage `onboarding` object only |
| **Role storage** | `{ account_type, role, activity, onboarding_done }` in localStorage |
| **Protected routes** | None; `/` redirects to `/start` if no onboarding, but no auth check |
| **Supabase Auth** | Client uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` — no `supabase.auth` usage |

**Conclusion:** Auth must be implemented from scratch. Supabase Auth is available via the same client and is the natural choice.

---

## 5. Database / ORM

| Aspect | Current State |
|--------|---------------|
| **ORM** | None |
| **Schema management** | Supabase dashboard (no migrations in repo) |
| **Tables known** | `jobs` only (inferred from `app/jobs/new/page.js`) |
| **Jobs schema (inferred)** | `title`, `description`, `municipality`, `budget_max` |

**No schema files in repo.** Supabase uses PostgreSQL; schema is managed in Supabase SQL Editor or migrations (if added).

---

## 6. Existing Entities vs Requirements

| Required Entity | Exists? | Current Mapping |
|-----------------|---------|-----------------|
| **User** | ❌ | Supabase `auth.users` exists but not used; no `profiles` table |
| **FreelancerProfile** | ❌ | — |
| **ClientProfile** | ❌ | — |
| **Job** | ⚠️ Partial | `jobs` table: title, description, municipality, budget_max. Missing: clientId, category, budgetType, budgetMin, skills, status, isRemote |
| **Proposal** | ❌ | — |
| **Contract** | ❌ | — |
| **Conversation** | ❌ | — |
| **Message** | ❌ | — |
| **Review** | ❌ | — |
| **Report** | ❌ | — |
| **AdminAction** | ❌ | — |

---

## 7. UI / Styling

| Aspect | Current State |
|--------|---------------|
| **UI kit** | Tailwind 4 + custom CSS (no component library) |
| **Fonts** | Instrument Serif, Sora (Google Fonts) |
| **Layout** | Sidebar + main content grid (`shell` → `sidebar` + `content`) |
| **Design tokens** | CSS variables: `--ink`, `--paper`, `--line`, `--radius-*` |
| **Components** | `SidebarTabs` (nav), basic form in jobs/new |
| **Language** | Serbian/Montenegrin (hardcoded strings) |

---

## 8. Compatibility Map

### ✅ Can Be Reused

| Item | Notes |
|------|-------|
| **Next.js App Router** | Keep; add new routes incrementally |
| **Supabase client** | Keep; extend for Auth + RLS |
| **Layout shell** | Sidebar + content structure; adapt nav items |
| **globals.css** | Design tokens, fonts, shell; extend for new components |
| **SidebarTabs** | Refactor nav items for marketplace IA |
| **Onboarding flow** | Adapt for role choice + minimal setup; integrate with Auth |
| **jobs/new form** | Extend for full Job schema; add clientId, category, status, etc. |
| **Tailwind** | Keep; use for new components |
| **Serbian/Montenegrin** | Already default; move to i18n file later |

### ⚠️ Must Be Replaced / Added

| Item | Action |
|------|--------|
| **Auth** | Implement Supabase Auth (sign up, sign in, session) |
| **Role storage** | Move from localStorage to `profiles` table linked to `auth.users` |
| **Jobs table** | Migrate schema (add columns) or new table |
| **All other entities** | New tables + migrations |
| **Broken sidebar links** | Replace with marketplace routes |
| **Home page** | Replace with Landing (public) + Dashboard (auth) |

### 🔧 Migration Plan (Small Steps)

1. **Phase 2:** Add Supabase migrations for full schema; seed cities + categories; keep existing `jobs` if possible (alter table).
2. **Phase 3:** Add Supabase Auth; create `profiles` table; onboarding writes to DB; protect routes.
3. **Phase 4:** Jobs CRUD + marketplace; update jobs/new; add jobs list + detail + filters.
4. **Phase 5:** Proposals; unique constraint; shortlist/hire.
5. **Phase 6:** Contracts + messaging.
6. **Phase 7:** Reviews.
7. **Phase 8:** Admin + reports.
8. **Phase 9:** UI polish, i18n file, empty/loading states.

---

## 9. Risk Summary

| Risk | Mitigation |
|------|------------|
| No schema in repo | Add `supabase/migrations/` with SQL; document in README |
| Anon key used for inserts | RLS + Auth; client inserts only when authenticated |
| localStorage for roles | Migrate to `profiles.role` on first Auth login |
| Mixed .ts/.tsx/.js | Standardize on .tsx for pages; convert page.js → page.tsx |

---

## 10. Phase 2 Readiness

**Ready to proceed.** Next steps for Phase 2:

1. Create `supabase/migrations/` (or document SQL for Supabase dashboard).
2. Define full schema: User/profiles, Job (extended), Proposal, Contract, Conversation, Message, Review, Report, AdminAction.
3. Seed `cities` and `categories` tables.
4. Provide migration SQL and "How to test" steps.

---

*End of Phase 1 Audit*
