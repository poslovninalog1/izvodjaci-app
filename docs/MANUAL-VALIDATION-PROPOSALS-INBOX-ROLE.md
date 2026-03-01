# Ručna validacija: Ponude, Inbox privatnost, Prekidač režima

## A) Send proposal UX

### Koraci
1. Na listi poslova klikni **"Pošalji ponudu"** na nekom poslu.
2. Treba da se otvori stranica detalja posla (**/jobs/[id]**) sa **?action=proposal** u URL-u.
3. Stranica treba da **skroluje** do sekcije sa formom za ponudu i **fokusira** prvo polje (pismo namjere).
4. Ako nisi ulogovan, treba da budeš preusmjeren na **/login?next=/jobs/[id]?action=proposal**; nakon prijave treba da završiš na formi za ponudu.

### Mogući razlozi zašto ranije nije radilo
- Dugme je vodilo na pogrešnu rutu (npr. `/client/jobs/[id]` umjesto `/jobs/[id]`).
- **ProposalForm** se ne renderuje na stranici detalja ili je skriven uslovima (npr. samo za `profile?.role === "freelancer"` ili `canApply`).
- Logika za scroll/fokus bila je u server komponenti (nema `useSearchParams` / `useEffect`).
- Query parametar **action=proposal** se gubio zbog `router.replace`, middleware-a ili redirecta.
- Forma se mountuje tek nakon učitavanja posla; effect se izvršio prerano (treba čekati mount forme preko **onMounted** ili kratkog timeout-a).
- Scroll kontejner nije window (npr. overflow kontejner); `scrollIntoView` nije pomjerio pravi parent.

---

## B) Prekidač režima (Client / Freelancer)

### Koraci
1. Uloguj se kao korisnik koji ima **role** npr. `freelancer` ili `client`.
2. U headeru treba da vidiš **"Mode: Klijent"** ili **"Mode: Izvođač"** (prema **profiles.active_role**).
3. Klikni na to; treba da se otvori padajući meni **"Prebaci na Izvođač"** / **"Prebaci na Klijent"**.
4. Klikni na prebacivanje; treba da se pozove RPC **set_active_role**, da se UI osvježi i da budeš preusmjeren na **/client/jobs** (ako si prešao na Klijent) ili **/freelancer/proposals** (ako si prešao na Izvođač).
5. Osvježi stranicu; **active_role** treba da ostane ono što si izabrao (perzistira u DB).
6. Ako si u režimu Izvođač a na stranici **/client/jobs** (ili obrnuto), treba da se prikaže banner: *"Trenutno si u režimu … Prebaci na …"* sa dugmetom za prebacivanje.
7. Na stranici posla, ako si u režimu Klijent, forma za ponudu treba da prikaže: *"Prebaci na režim Izvođač da pošalješ ponudu."*

---

## C) Inbox privatnost

### Zahtjev
Korisnik smije vidjeti **samo** razgovore u kojima učestvuje (participant). Korisnik C ne smije vidjeti razgovor između A i B.

### Koraci (ručna provjera)
1. **Korisnik A** i **Korisnik B**: napravi razgovor (npr. preko ugovora ili direktne poruke).
2. **Korisnik C**: uloguj se kao treći korisnik.
3. C ne smije vidjeti taj razgovor u listi inbox-a (sidebar i /inbox).
4. C ne smije moći otvoriti **/inbox/[conversationId]** za taj razgovor – treba da dobije "not found" / prazan prikaz ili poruku o nedozvoljenom pristupu (RLS vraća 0 redova za conversation ili messages).
5. A vidi samo svoje razgovore; B takođe samo svoje.

### Tehnički detalji
- **v_inbox_threads** je postavljen na **security_invoker = true**, tako da se RLS na **conversation_participants** primjenjuje i view vraća samo redove za **auth.uid()**.
- **conversations** SELECT: dozvoljen samo ako postoji red u **conversation_participants** sa **user_id = auth.uid()**.
- **messages** SELECT: dozvoljen samo ako je korisnik participant tog razgovora (preko **conversation_participants**).

### Dev logovi
- U dev modu, pri učitavanju inbox threadova: **conversation_id**, **count**, **error** (code, message, details, hint).
- Na stranici **/inbox/[conversationId]**: pri fetchu conversation i messages loguje se **conversationId**, **count**, **error** (code, message, details, hint).
