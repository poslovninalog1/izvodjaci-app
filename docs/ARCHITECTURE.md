# Architecture

Folder-by-folder layout, route → database mapping, role system, and Supabase architecture.

---

## Folder-by-folder

| Folder / file | Purpose |
|---------------|---------|
| **app/** | Next.js App Router. All routes, layouts, and UI. Single frontend entry. |
| **app/components/** | Shared React components (TopHeader, Logo, modals, UI primitives). |
| **app/context/** | React context providers (AuthContext, ToastContext). |
| **app/admin/** | Admin panel routes (moderation). |
| **app/client/** | Client-area routes (my jobs, proposals). |
| **app/contracts/** | Contract list, detail, and review flows. |
| **app/freelancer/** | Freelancer proposals. |
| **app/inbox/** | Messaging (conversations, messages). |
| **app/izvodjac/**, **app/klijent/** | Public freelancer and client profiles. |
| **app/jobs/** | Job listing, detail, create job. |
| **app/login/**, **app/register/** | Auth pages. |
| **app/profil/**, **app/start/** | Own profile and onboarding (role + profile). |
| **src/lib/** | Shared utilities. Single Supabase browser client: `src/lib/supabaseClient.js`. |
| **supabase/** | Supabase-only config and migrations. No app code. |
| **supabase/config.toml** | Local Supabase (Docker) configuration. |
| **supabase/migrations/** | Ordered SQL migrations (00001_* … 00013_*). Source of truth for schema + RLS. |
| **contracts-module/** | Separate service. Fastify + Prisma, S3-compatible storage, OTP signing. Own `package.json`, `.env.example`, README. Not part of Next.js or Supabase config. |
| **docs/** | Architecture and workflow documentation. |

---

## Route → feature → database table mapping

| Route(s) | Feature | Main Supabase tables |
|----------|---------|----------------------|
| `/`, `/jobs` | Landing, job list + filters | `categories`, `cities`, `jobs` |
| `/jobs/new` | Create job | `jobs` |
| `/jobs/[id]` | Job detail, submit proposal | `jobs`, `categories`, `proposals` |
| `/client/jobs` | Client: my jobs | `jobs` |
| `/client/jobs/[id]/proposals` | Client: view/accept proposals, create contract | `jobs`, `proposals`, `contracts`, `conversations` |
| `/freelancer/proposals` | Freelancer: my proposals | `proposals` |
| `/contracts` | My contracts | `contracts`, `profiles` |
| `/contracts/[id]` | Contract detail, complete, review | `contracts`, `profiles`, `conversations`, `reviews` |
| `/inbox`, `/inbox/[conversationId]` | Messaging | `conversations`, `messages`, `profiles` |
| `/izvodjac/[id]` | Public freelancer profile | `profiles`, `freelancer_profiles`, `reviews` |
| `/klijent/[id]` | Public client profile | `profiles`, `client_profiles`, `reviews` |
| `/profil` | Own profile | `profiles`, `freelancer_profiles` / `client_profiles` |
| `/start` | Onboarding (role + profile) | `profiles`, `freelancer_profiles`, `client_profiles` |
| `/login`, `/register` | Auth | Supabase Auth; `profiles` via trigger |
| `/admin` | Moderation | `jobs`, `profiles`, `reports`, `reviews` (admin RLS) |

Reference / system: `categories`, `cities` (seed); `admin_actions`; `reports`.

---

## Role system overview (client / freelancer / admin)

Access is enforced by Supabase RLS using `profiles.role` and row ownership.

| Role | Description | Access |
|------|-------------|--------|
| **client** | Job poster, hires freelancers | Own jobs (CRUD); proposals for own jobs; create contracts; conversations with hired freelancers; report content. |
| **freelancer** | Contractor | Own proposals; public profile; contracts where freelancer; conversations; submit reviews; report content. |
| **admin** | Moderation | Read all jobs, profiles, reports; update `profiles.deactivated`, `jobs.status`, `reviews.is_hidden`; `admin_actions`. |

- **Unauthenticated**: Can see public job list (published), public freelancer/client profiles, landing. Cannot create jobs or proposals.
- **Auth trigger**: On sign-up, `profiles` row created with default role `client`; `/start` can set role to `freelancer` and fill `freelancer_profiles` / `client_profiles`.

RLS details: `supabase/migrations/` (e.g. `00006_rls.sql`, `00007_phase3_rls.sql`, `00012_phase8_admin.sql`).

---

## Supabase architecture (text diagram)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NEXT.JS APP (app/ + src/lib)                    │
│  Browser → supabaseClient.js → NEXT_PUBLIC_SUPABASE_URL + ANON_KEY      │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
         ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
         │  Supabase    │   │  Supabase     │   │  Supabase     │
         │  Auth        │   │  PostgREST    │   │  Realtime     │
         │  (JWT)       │   │  (public API) │   │  (optional)   │
         └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
                │                  │                  │
                └──────────────────┼──────────────────┘
                                   ▼
         ┌─────────────────────────────────────────────────────────────┐
         │                  POSTGRES (Supabase DB)                      │
         │  public: profiles, jobs, proposals, contracts, conversations,│
         │          messages, reviews, reports, categories, cities,     │
         │          freelancer_profiles, client_profiles, admin_actions │
         │  auth: users (Supabase managed)                              │
         │  RLS: policies per table (role + ownership)                   │
         └─────────────────────────────────────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
  LOCAL (Docker)            CLOUD (Hosted)           contracts-module
  supabase start            supabase link            (separate service)
  supabase db reset         supabase db push         Prisma → same DB
  .env.local → 127.0.0.1    .env → PROJECT.ref       S3 for PDFs
```

- **Local**: Docker stack via Supabase CLI; `config.toml` in `supabase/`; migrations in `supabase/migrations/`.
- **Cloud**: Linked project; same migrations via `supabase db push`; frontend env points at `https://PROJECT.supabase.co`.
- **contracts-module**: Uses same Postgres (e.g. same DB URL as Supabase); S3-compatible storage for contract PDFs; not part of Supabase config.
