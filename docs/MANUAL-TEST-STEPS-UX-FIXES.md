# Ručni test koraci – UX i podaci (inbox, mod, account type, tabovi, poslovi)

## 1) Inbox: ime pošiljaoca na porukama

- Otvori razgovor u Inboxu (`/inbox/[conversationId]`).
- Za svaku poruku iznad bubblea treba da se vidi **ime pošiljaoca** (iz `profiles.full_name`).
- Ako profil nema ime, prikaže se skraćeni `sender_id` (npr. prvih 8 znakova + "…").
- Novi poruke (realtime) takođe dobijaju ime kada se učita profil pošiljaoca.

---

## 2) Oznake: Mod, Poslodavac, Izvođač

- U headeru (RoleSwitcher): **"Mod: Poslodavac"** ili **"Mod: Izvođač"** (ne "Mode", ne "Klijent").
- U padajućem meniju: **"Prebaci na Poslodavac"** / **"Prebaci na Izvođač"**.
- Na banneru (RouteModeBanner) kada si na pogrešnoj ruti: reč "Poslodavac" i "Izvođač" korišćeni u tekstu.

---

## 3) Prebacivanje na Izvođač → modal "Fizičko / Pravno lice"

1. Uloguj se kao korisnik koji može biti izvođač (npr. `role` ili `active_role` freelancer).
2. Budi u režimu **Poslodavac** (Mod: Poslodavac).
3. Klikni **Mod: Poslodavac** → **Prebaci na Izvođač**.
4. **Očekivano:** Nakon uspešnog prebacivanja otvori se modal: **"Da li ste fizičko ili pravno lice?"** sa dugmadima **"Fizičko lice"** i **"Pravno lice"**.
5. Izaberi npr. **"Fizičko lice"**.
6. **Očekivano:** Vrednost se sačuva u `profiles.account_type`, modal se zatvori, preusmeri se na `/freelancer/proposals`.
7. Ponovo prebaci na Poslodavac pa opet na Izvođač.
8. **Očekivano:** Modal se **ne** prikazuje jer je `account_type` već setovan (prikazuje se samo kada je `account_type` NULL).

---

## 4) Tabovi u navigaciji po aktivnom modu

- Kada je **Mod: Poslodavac** (active_role = client):
  - U sidebaru / headeru vidi se tab **"Moji poslovi"** (i radi).
  - Tab **"Moje ponude"** se ne prikazuje.
- Kada je **Mod: Izvođač** (active_role = freelancer):
  - Vidi se tab **"Moje ponude"** (i radi).
  - Tab **"Moji poslovi"** se ne prikazuje.
- Stranice `/client/jobs` i `/freelancer/proposals` dozvoljavaju pristup i kada je odgovarajući **active_role** setovan (ne samo `profile.role`).

---

## 5) Poslodavac – Moji poslovi i ponude

- **Moji poslovi** (`/client/jobs`):
  - Lista sadrži **samo** poslove gde je `jobs.client_id = auth.uid()`.
  - U dev konzoli: log **auth uid** i **returned count** (broj poslova).
  - Za svaki posao postoji link **"Ponude"** koji vodi na `/client/jobs/[id]/proposals`.
  - Pored "Ponude" prikazuje se **(N)** ako ima N ponuda (N > 0).
- **Stranica Ponude** (`/client/jobs/[id]/proposals`):
  - Učitava podatke iz **v_proposals** za taj `job_id`.
  - Za svaku ponudu prikazuje: **ime izvođača** (freelancer_name), **ponuđenu cijenu** (getProposalPriceDisplay), **kratak pregled** cover_letter / message, **status** (compat normalize + badge), **created_at**.
  - RLS ostaje: klijent vidi samo ponude za svoje poslove.

---

## 6) Inbox privatnost (regresija)

- Korisnik C **ne** vidi razgovor između A i B (ni u listi ni preko direktnog URL-a).
- Na `/inbox/[conversationId]` za tuđi razgovor prikazuje se **"Not found or no access."**

---

## DB migracija

- Pokreni **`supabase/migrations/00022_profiles_account_type.sql`** (dodaje `profiles.account_type` sa CHECK `'physical' | 'legal'`).
- View **v_proposals**: treba da izlaže `id, job_id, freelancer_id, cover_letter, proposed_fixed, proposed_rate, amount, message, status, created_at` i **freelancer_name** (iz `profiles`). Ako u shemi postoje i `freelancer_username`, `freelancer_avatar_url`, mogu se uključiti u view i u select na stranici ponuda.
