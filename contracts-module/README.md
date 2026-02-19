# Contracts Module

Production-ready contract generation, SES+OTP digital signing, and audit trail for the Izvođači marketplace.

## Architecture

```
contracts-module/
├── prisma/schema.prisma       Data model (ctm_* tables — no conflict with existing Supabase tables)
├── src/
│   ├── app.ts                 Fastify entry point (port 3001)
│   ├── config.ts              Env-based configuration
│   ├── prisma.ts              PrismaClient singleton
│   ├── state-machine.ts       Contract lifecycle: Draft → Signed → Disputed → Resolved
│   ├── types.ts               Shared TypeScript types
│   ├── errors.ts              Custom HTTP error classes
│   ├── utils/                 hash (SHA-256), contract-number, sanitize
│   ├── services/
│   │   ├── contract.service   Orchestrator: create, sign, cancel, dispute, amend
│   │   ├── pdf.service        PDFKit-based contract PDF generation
│   │   ├── otp.service        6-digit OTP with rate limiting
│   │   ├── audit.service      Append-only audit log
│   │   └── storage.service    S3-compatible object storage
│   ├── middleware/auth.ts      HMAC token auth (swap for real JWT in production)
│   └── routes/                REST endpoints
└── tests/                     Vitest: unit + integration
```

## Prerequisites

- Node.js >= 20
- PostgreSQL (the same instance as the main app)
- S3-compatible storage (MinIO for local dev, or Supabase Storage)

## Setup

```bash
cd contracts-module
cp .env.example .env
# Edit .env — set DATABASE_URL to your Supabase/PostgreSQL connection string

npm install
npx prisma generate
npx prisma migrate dev --name init
```

## Run

```bash
npm run dev          # tsx watch mode on port 3001
npm run build        # TypeScript → dist/
npm start            # production (after build)
```

## Run tests

```bash
# Unit tests (no database needed)
npm test -- tests/state-machine.test.ts tests/signing.test.ts

# Integration tests (needs DATABASE_URL + Prisma migration applied)
npm test -- tests/integration.test.ts

# All tests
npm test
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/contracts/from-offer/:offerId` | Internal | Create contract when offer is accepted |
| GET | `/contracts/:id` | Bearer | Get contract details + signatures |
| GET | `/contracts/:id/pdf` | Bearer | Download draft or signed PDF |
| POST | `/contracts/:id/otp/request` | Bearer | Request signing OTP (sent via email) |
| POST | `/contracts/:id/sign` | Bearer | Sign with OTP `{ "otp": "123456" }` |
| POST | `/contracts/:id/cancel` | Bearer | Cancel `{ "reason": "..." }` |
| POST | `/contracts/:id/dispute/open` | Bearer | Open dispute `{ "reason": "..." }` |
| POST | `/contracts/:id/amendments` | Bearer | Create annex `{ "title": "...", "content": "..." }` |
| GET | `/contracts/:id/audit` | Bearer | Full audit trail |

## Contract Lifecycle

```
DRAFT ──→ PENDING_SIGNATURES ──→ PARTIALLY_SIGNED ──→ SIGNED
  │              │                       │                │
  └──→ CANCELLED ←───────────────────────┘                │
                                                          ↓
                                              DISPUTED ──→ RESOLVED
```

- **DRAFT → PENDING_SIGNATURES**: Automatic on creation (after PDF is generated).
- **PENDING_SIGNATURES → PARTIALLY_SIGNED**: One party signs via OTP.
- **PARTIALLY_SIGNED → SIGNED**: Both parties sign. Final PDF + hash stored.
- **Any pre-signed state → CANCELLED**: Either party cancels.
- **SIGNED → DISPUTED**: Either party opens a dispute.
- **DISPUTED → RESOLVED**: Admin or automated resolution.

## Signing Flow

1. Party calls `POST /contracts/:id/otp/request` → OTP sent to their email.
2. Party calls `POST /contracts/:id/sign` with `{ "otp": "123456" }`.
3. System verifies OTP, creates `ContractSignature` record with IP, user-agent, timestamp, PDF hash.
4. If both parties have signed, system generates the final PDF, computes SHA-256 hash, stores in S3.

## Tamper Evidence

- Every PDF version has a SHA-256 hash stored in the database.
- Each signature records the `pdfHashAtSigning` — the hash of the document at the moment of signing.
- The `finalHash` on a SIGNED contract matches the signed PDF's SHA-256.
- Audit log is append-only (insert-only table).

## Serbian Diacritics in PDFs

PDFKit's built-in Helvetica has limited support for characters like Č, Ć, Š, Ž, Đ. For full support:

1. Download a TTF font with Latin Extended (e.g., Noto Sans).
2. Set `PDF_FONT_PATH=/path/to/NotoSans-Regular.ttf` in `.env`.

The PDF service will automatically use the custom font when configured.

## Integration with the Main App

When the main Next.js app accepts an offer, it should POST to this module:

```typescript
await fetch("http://localhost:3001/contracts/from-offer/" + offerId, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    offerId,
    jobId,
    jobTitle: job.title,
    jobDescription: job.description,
    employerId: employer.id,
    employerName: employer.fullName,
    employerEmail: employer.email,
    contractorId: contractor.id,
    contractorName: contractor.fullName,
    contractorEmail: contractor.email,
    price: offer.price,
    // ...other fields
  }),
});
```

## Expiry (Background Job)

Contracts in `PARTIALLY_SIGNED` status have an `expiresAt` field (default: 7 days after creation). A background job should periodically check for expired contracts and transition them to `CANCELLED`. Placeholder for implementation:

```sql
UPDATE ctm_contracts
SET status = 'CANCELLED'
WHERE status IN ('PENDING_SIGNATURES', 'PARTIALLY_SIGNED')
  AND expires_at < NOW();
```

This can be run via `pg_cron`, a Supabase Edge Function on a schedule, or a simple Node.js cron job.
