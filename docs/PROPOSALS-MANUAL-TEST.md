# Ponude (Proposals) — ručna provjera i migracija baze

## Ručni test koraci

1. **Kreiraj posao (client)**  
   Prijavi se kao klijent → Poslovi → Novi posao. Ispuni naslov, opis, budžet (fiksni ili po satu), objavi posao.

2. **Pošalji ponudu (freelancer)**  
   Prijavi se kao izvođač → Poslovi → otvori objavljeni posao → u formi "Pošalji ponudu" unesi pismo namjere (min. 50 znakova) i predloženu cijenu/satnicu → Pošalji ponudu.

3. **Vidi ponude kao izvođač**  
   Izvođač → Moje ponude (`/freelancer/proposals`). Treba da vidi poslanu ponudu sa naslovom posla, statusom (npr. "Poslato") i datumom.

4. **Vidi ponude kao klijent**  
   Klijent → Moje poslove → otvori posao → Ponude (`/client/jobs/[id]/proposals`). Treba da vidi listu ponuda (izvođač, status, cijena, pismo).

---

## Migracija baze (opcionalno): prelazak na status flow iz 00013

Ako baza još uvijek koristi stare statuse (`submitted`, `shortlisted`, `rejected`, `hired`), aplikacija šalje `status: 'submitted'` i prikaz koristi compat sloj. Ako želiš novi flow (`pending`, `accepted`, `withdrawn`, `rejected`, `expired`):

1. U Supabase SQL Editoru (ili lokalno) **primijeni migraciju**  
   `supabase/migrations/00013_decision_flow.sql`

2. Šta 00013 radi:
   - Dodaje `decision_deadline` na `jobs` i `rejection_reason` na `proposals`.
   - Prebacuje postojeće statuse: `submitted`/`shortlisted` → `pending`, `hired` → `accepted`.
   - Mijenja CHECK na `proposals`: dozvoljeni su `pending`, `accepted`, `rejected`, `withdrawn`, `expired`.
   - Odbijene ponude moraju imati popunjen `rejection_reason`.

3. Nakon primjene 00013:
   - U kodu u `src/lib/proposals/compat.ts` možeš promijeniti `PROPOSAL_INSERT_STATUS` na `'pending'` ako želiš da se novi inserti šalju sa `pending`.
   - Prikaz (Poslato, Odbijeno, Angažovan, itd.) radi i za stare i za nove statuse preko `normalizeProposalStatus` / `getProposalStatusLabel`.

---

## Detekcija flow-a (opcionalno u kodu)

Ako želiš da aplikacija automatski koristi `pending` kad baza to podržava: pri prvom insertu pošalji `status: 'pending'`; ako dobiješ grešku tipa constraint (npr. `23514`), prikaži poruku "Baza nije usklađena (status flow)" i/ili ponovi insert sa `status: 'submitted'`. Trenutno je fiksno `'submitted'` da radi sa trenutnim stanjem baze bez 00013.
