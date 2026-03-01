# Ugovori – sažetak izmjena

## Šta je promijenjeno

### 1. Auto-kreiranje ugovora (DB)

**Migracija `00028_auto_contract_from_proposal.sql`:**
- Dozvoljen status `hired` u `proposals` (uz `accepted`)
- Unique indeks na `contracts (job_id, freelancer_id)` za `ON CONFLICT`
- Funkcija `ensure_contract_for_proposal(proposal_id)` – SECURITY DEFINER, vraća `contract.id`
- Trigger na `proposals` – kad se status promijeni u `accepted` ili `hired`, automatski se kreira ugovor
- Backfill – za sve postojeće `accepted`/`hired` ponude bez ugovora

### 2. Routing i stranice ugovora

**`/contracts` (lista):**
- Koristi `contract.id` (bigint) u linku `/contracts/{id}`

**`/contracts/[id]` (detalj):**
- Ako je parametar broj: prvo traži po `contract.id`, pa po `job_id` ako nema rezultata
- Ako korisnik nije strana u ugovoru, prikazuje se "Ugovor nije pronađen"

**`/contracts/job/[jobId]`:**
- Traži ugovor po `job_id` i `client_id` ili `freelancer_id`
- Preusmjerava na `/contracts/{contractId}`

### 3. Klijent – prihvatanje ponude

**`app/client/jobs/[id]/proposals/page.tsx`:**
- Status se postavlja na `accepted` (umjesto `hired`)
- Nakon prihvatanja poziva se `ensureContractForProposalAction` i preusmjerava na ugovor
- Za već prihvaćene ponude: dugme "Otvori ugovor" ili "Kreiraj ugovor" ako ugovor još ne postoji

### 4. Freelancer – Moje ponude

**`app/freelancer/proposals/page.tsx`:**
- Srpski tekstovi: "Otvori ugovor", "Ugovor još nije kreiran.", "Kreiraj ugovor"
- Dugme "Kreiraj ugovor" poziva `ensureContractForProposalAction` ako ugovor ne postoji

### 5. Logovanje i sanity check

**`src/lib/contracts/ensureContractForProposal.ts`:**
- `console.log` u developmentu: `proposalId`, `userId`, `contractId`, greške

**`supabase/sql/sanity_contracts.sql`:**
- Lista `accepted`/`hired` ponuda
- Ponude bez ugovora
- Lista ugovora
- Test poziv `ensure_contract_for_proposal` za zadnju prihvaćenu ponudu

---

## Kako testirati

1. **Primijeni migraciju:**
   ```bash
   supabase db push
   # ili ručno u Supabase SQL Editor: sadržaj 00028_auto_contract_from_proposal.sql
   ```

2. **Sanity check:**
   - Pokreni `supabase/sql/sanity_contracts.sql` u SQL Editoru
   - Provjeri da li postoje ponude bez ugovora i da li backfill radi

3. **Klijent prihvata ponudu:**
   - Prijavi se kao klijent
   - Otvori posao sa ponudama → "Prihvati"
   - Trebalo bi da se otvori stranica ugovora

4. **Freelancer – Moje ponude:**
   - Prijavi se kao freelancer
   - Za angažovanu ponudu: "Otvori ugovor" ili "Kreiraj ugovor" ako ugovor ne postoji

5. **Lista ugovora:**
   - `/contracts` – treba prikazati ugovore
   - Klik na ugovor → `/contracts/{id}` – detalj ugovora

6. **Ako ugovor ne postoji:**
   - Klik na "Kreiraj ugovor" u Moje ponude ili na stranici ponuda klijenta
   - Trebalo bi da se kreira ugovor i otvori stranica detalja
