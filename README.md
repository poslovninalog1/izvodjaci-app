# Izvođači — Marketplace

Next.js (App Router) + Supabase marketplace for clients and freelancers. Supports jobs, proposals, contracts, messaging, reviews, and admin moderation.

---

## Architecture Overview

| Layer | Stack |
|-------|--------|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS |
| **Auth & Data** | Supabase (Auth, Postgres, RLS) |
| **Contracts service** | `contracts-module/` — Fastify + Prisma, S3-compatible storage, OTP signing |

- **Single repo**: one Git root; no nested repos or submodules.
- **App** lives under `app/` (App Router). Shared Supabase client: `src/lib/supabaseClient.js`.
- **Supabase**: migrations and config under `supabase/`. Local dev via Docker (Supabase CLI).
- **contracts-module**: standalone Node service (port 3001); uses same Postgres as Supabase and S3-compatible storage.

---

## Prerequisites

- **Node.js 20 or 22 LTS** (required). **Node 24+ is not supported** — Tailwind v4 uses `lightningcss`, which has no prebuilt native bindings for Node 24; you will see "Cannot find module 'unknown'" if you use Node 24.
- Docker (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

This project runs a **preflight check** before `npm install`, `npm run dev`, and `npm run build`. If you are on Node 24, those commands will fail with a clear message telling you to switch to Node 22.

**If lightningcss fails with "Cannot find module 'unknown'" or missing `../pkg` / `lightningcss.<platform>.node`:** your npm is likely omitting optional dependencies (e.g. global `omit=optional`). Fix: run `npm config delete omit`, then remove `node_modules` and `package-lock.json`, then `npm install --include=optional`. Or run `npm run dev:clean:full` (after Node 22).

**Why `npm run dev` uses Webpack (not Turbopack):** Tailwind v4 uses lightningcss, which loads a **native Node addon** (e.g. `lightningcss-win32-x64-msvc.node`). That addon is installed correctly, but **Turbopack's runtime cannot resolve or load native addons** when it runs PostCSS, so you get "Cannot find module 'unknown'" even when the binary is present. Using Webpack for dev (`next dev --turbopack=false`) runs PostCSS in normal Node, so lightningcss works. Use `npm run dev:turbo` only to try Turbopack; it may fail on CSS until Next.js improves native addon support.

---

### Node 22: Install or switch

**Path A — Windows (no nvm): install Node 22 LTS**

1. Download **Node.js 22 LTS** (MSI) from [https://nodejs.org/](https://nodejs.org/).
2. Run the installer. Ensure "Add to PATH" is checked.
3. Close and reopen PowerShell, then verify:
   ```powershell
   node -v
   ```
   You must see `v22.x.x`. If you see `v24.x.x`, uninstall Node 24 from Windows Settings → Apps, then install Node 22 again.

**Path B — Windows: nvm-windows**

1. Install [nvm-windows](https://github.com/coreybutler/nvm-windows/releases) (e.g. `nvm-setup.exe`).
2. In a **new** PowerShell (Run as Administrator if needed):
   ```powershell
   nvm install 22
   nvm use 22
   node -v
   ```
   You must see `v22.x.x`.

**Path B — macOS / Linux: nvm**

```bash
nvm install 22
nvm use 22
node -v
```

You must see `v22.x.x`.

---

### After Node 22 is active: one command to run the app

From the repo root:

```powershell
npm run dev:clean
```

This will: remove `.next`, run `npm install`, then start the dev server with Turbopack.  
To also remove `node_modules` and do a full reinstall:

```powershell
npm run dev:clean:full
```

Or, if you already ran `npm install` once:

```powershell
npm install
npm run dev
```

---

### Clean reinstall (manual)

**Windows PowerShell:**

```powershell
Remove-Item -Recurse -Force node_modules, .next -ErrorAction SilentlyContinue
npm install
npm run dev
```

**macOS / Linux:**

```bash
rm -rf node_modules .next
npm install
npm run dev
```

---

### Verification steps (after Node 22)

Run from repo root:

```powershell
node -v          # must show v22.x.x
npm -v           # recommended: npm 11.x (see packageManager in package.json)
npm run doctor   # checks omit config and lightningcss platform binaries
```

If `npm run doctor` fails, it prints recovery commands. Then:

```powershell
npm run dev:clean:full
npm run dev
```

---

## Local Development

1. **Install** (requires Node 20 or 22)
   - `npm install`
2. **Supabase (local Docker)**
   - `npm run supabase:start`
   - Copy the API URL and anon key from the output (or run `supabase status`).
3. **Environment**
   - `cp .env.local.example .env.local`
   - Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (use the values from step 2 for local).
4. **Apply migrations**
   - `npm run supabase:reset`
5. **Run the app**
   - `npm run dev`
   - Open [http://localhost:3000](http://localhost:3000).

### Contracts module (optional)

See `contracts-module/README.md`. From repo root:

```bash
cd contracts-module
cp .env.example .env
# Edit .env (DATABASE_URL = same Postgres as Supabase; S3/MinIO for storage)
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Runs on port 3001.

---

## Database Changes

- Create a new migration: `supabase migration new <name>` (creates a file under `supabase/migrations/`).
- Apply locally: `npm run supabase:reset`.
- Commit the new migration file(s). Never edit migrations that have already been applied.

### View grants (if inbox unread or proposals list fails)

If the app logs **permission denied for relation v_unread_counts** or **permission denied for relation v_proposals** (or "relation ... does not exist"), run the following in the Supabase SQL editor (Dashboard → SQL). Do **not** add these as repo migrations if your views were created outside migrations.

```sql
-- Allow authenticated users to read the unread-count and proposals views
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.v_unread_counts TO authenticated;
GRANT SELECT ON public.v_proposals TO authenticated;
```

**Root cause found (fill after reproducing):** Open browser Console + Network. On `/inbox/[conversationId]` look for `[mark-read]`: if `readRow` is null or `readErr` is set, that is the cause (e.g. RLS blocks update, or wrong conversationId). On sidebar load look for `[unread view]`: if `error` is set (e.g. "permission denied for relation v_unread_counts" or "relation v_unread_counts does not exist"), run the GRANTs above. On proposal submit look for `[proposals insert]`: if `readErr` is set (e.g. "new row violates row-level security policy" or "column ... does not exist"), fix RLS or payload columns.

---

## Deploy to Cloud

1. **Link Supabase project**: `supabase link --project-ref <YOUR_PROJECT_REF>` (ref from dashboard URL).
2. **Push migrations**: `npm run supabase:push`.
3. **Deploy frontend**: Deploy the Next.js app (e.g. Vercel) with production env:
   - `NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=PROD_ANON_KEY` (from Supabase dashboard; never commit).

---

## Supabase Workflow (reference)

### Local (Docker)

- **Start**: `supabase start` — runs Postgres, Auth, Studio, etc. in Docker.
- **Stop**: `supabase stop`
- **Status**: `supabase status` — shows API URL, anon key, DB URL.
- **Reset DB**: `supabase db reset` — reapplies all migrations from `supabase/migrations/`.
- **Create migration**: `supabase migration new <name>` — new file under `supabase/migrations/`.
- **Apply migrations**: `supabase db reset` (local) or `supabase db push` (remote).

Point the Next.js app at the local API URL and anon key in `.env.local`.

### Cloud (hosted project)

- **Link**: `supabase link --project-ref <ref>` (ref from dashboard URL).
- **Push migrations**: `supabase db push`
- **Pull remote changes**: `supabase db pull` (generates migration from remote schema).

Secrets and production keys stay in Supabase Dashboard / CI; never commit them.

---

## Production Deployment

- **Next.js**: Deploy to Vercel (or any Node host). Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the **production** Supabase project.
- **Supabase**: Use a dedicated hosted project; run migrations via `supabase db push` or CI.
- **contracts-module**: Deploy as a separate service (e.g. Node on a VM or container). Use production `DATABASE_URL`, S3/Supabase Storage, and a strong `JWT_SECRET`.

---

## Team Git Workflow

- **main**: default branch; deployable state.
- **Feature branches**: branch from `main`, open PR, merge after review.
- **Migrations**: add under `supabase/migrations/` with sequential names; never edit applied migrations.
- **Env**: never commit `.env` or `.env.local`; use `.env.local.example` (no secrets) and document required vars in this README and in `docs/ARCHITECTURE.md`.

---

## Environment Variables

### Next.js app (root `.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project API URL (local or cloud). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key. |

### contracts-module

See `contracts-module/.env.example`. Includes: `DATABASE_URL`, S3-related vars, `JWT_SECRET`, `PORT`, etc. Do not commit real secrets.

---

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server with **Webpack** (port 3000). Default so Tailwind v4 + lightningcss work. |
| `npm run dev:turbo` | Start dev server with Turbopack (experimental; lightningcss native addon may fail). |
| `npm run dev:clean` | Remove `.next`, run `npm install`, then start dev (one command after Node 22). |
| `npm run dev:clean:full` | Same as `dev:clean` but also removes `node_modules` and `package-lock.json` (full reinstall with optional deps). |
| `npm run doctor` | Check Node, npm omit config, and lightningcss platform binaries; prints recovery if broken. |
| `npm run dev:no-turbo` | Start dev server with Webpack (diagnostic fallback). |
| `npm run build` | Production build. |
| `npm run start` | Run production server. |
| `npm run lint` | Run ESLint. |
| `npm run supabase:start` | Start local Supabase (Docker). |
| `npm run supabase:stop` | Stop local Supabase. |
| `npm run supabase:reset` | Reset local DB and reapply migrations. |
| `npm run supabase:push` | Push migrations to linked cloud project. |

---

## Verification commands (run from repo root)

**Local Supabase**

```bash
npm run supabase:start    # Start Docker stack
npx supabase status       # Show API URL, anon key, DB URL
npm run supabase:reset    # Apply all migrations (drops and recreates local DB)
```

**Cloud (after linking)**

```bash
npx supabase login        # Authenticate with Supabase
npx supabase link --project-ref <YOUR_PROJECT_REF>
npm run supabase:push     # Push migrations to linked project
```

---

## Production deployment checklist

- [ ] Create a dedicated Supabase project in the dashboard (do not use the same project for staging and production).
- [ ] Set production env in your host (Vercel / etc.): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (use **anon** key only).
- [ ] **Never use the service_role key in the frontend.** Use only the anon (public) key in the Next.js app; RLS enforces access.
- [ ] Run `supabase link --project-ref <prod-ref>` then `npm run supabase:push` to apply migrations to production DB (or run migrations in CI).
- [ ] Deploy the Next.js app after migrations are applied.
- [ ] Keep secrets (service_role, DB password) only in Supabase Dashboard or CI secrets; never in repo or client env.

### Required production env variables (no secrets in repo)

| Variable | Where to set | Description |
|----------|--------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Host (e.g. Vercel) | `https://<PROJECT_REF>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Host (e.g. Vercel) | Anon key from Supabase Dashboard → Settings → API |

### Safe migration workflow

1. Create migration locally: `supabase migration new <name>`.
2. Edit the new file under `supabase/migrations/`.
3. Apply locally: `npm run supabase:reset` (or `supabase db reset`).
4. Test the app locally; commit the migration file(s).
5. For cloud: `supabase link` to the target project, then `npm run supabase:push`. Do not edit or delete migrations that have already been applied.

### Warning: do not use service_role in the frontend

The **service_role** key bypasses Row Level Security (RLS). It must only be used in trusted server-side or backend contexts (e.g. a secure API route or the contracts-module). **Never** expose it in the browser or in `NEXT_PUBLIC_*` env vars. The Next.js app should use only **NEXT_PUBLIC_SUPABASE_ANON_KEY** (anon key).

---

## Learn More

- [Next.js App Router](https://nextjs.org/docs/app)
- [Supabase Docs](https://supabase.com/docs)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Architecture and route → DB mapping: `docs/ARCHITECTURE.md`
