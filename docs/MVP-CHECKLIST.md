# izvođači MVP — Checklist i tokovi

**Branding:** Platform name is "izvođači" (lowercase, with đ). Light professional theme, red accent.

## End-to-end tokovi

### Klijent (client)

1. **Registracija i onboarding**
   - Registracija → `/register`
   - Onboarding → `/start` (izbor uloge: client/freelancer)
   - Nakon onboardinga → početna stranica

2. **Objavljivanje posla**
   - `/jobs/new` → unos naslova, opisa, kategorije, grada, budžeta
   - Sačuvano kao nacrt → `/client/jobs`
   - Objavi posao (draft → published)

3. **Pregled ponuda**
   - `/client/jobs` → lista poslova
   - Klik na "Ponude" → `/client/jobs/[id]/proposals`
   - Shortlist / Odbij / Angažuj

4. **Angažovanje izvođača**
   - Klik "Angažuj" → kreira se ugovor + razgovor
   - Redirect na `/contracts/[id]`

5. **Ugovor i razgovor**
   - `/contracts` → lista ugovora
   - `/contracts/[id]` → detalj, "Otvori razgovor" → `/inbox/[conversationId]`
   - Klijent označava ugovor kao završen

6. **Ocjena**
   - Nakon završetka ugovora → forma za ocjenu izvođača

### Izvođač (freelancer)

1. **Registracija i onboarding**
   - Isti tok kao klijent, uloga: freelancer

2. **Pregled poslova**
   - `/jobs` → filteri (kategorija, grad, remote, budžet)
   - Klik na posao → `/jobs/[id]`

3. **Slanje ponude**
   - Na stranici posla → forma "Pošalji ponudu"
   - Pismo namjere (min 50 znakova) + predložena cijena
   - Toast: "Ponuda je poslata!"

4. **Pregled ponuda**
   - `/freelancer/proposals` → status (Poslato, U užem izboru, Odbijeno, Angažovan)

5. **Ugovor i razgovor**
   - Isti tok kao klijent
   - Izvođač ne može označiti ugovor kao završen (samo klijent)

6. **Ocjena**
   - Nakon završetka → ocjena klijenta

### Admin

1. **Pristup**
   - `profile.role === 'admin'` → link "Admin" u headeru
   - `/admin` → tabovi: Prijave, Poslovi, Korisnici, Ocjene

2. **Prijave (reports)**
   - Pregled svih prijava (target_type, target_id, razlog)
   - Nema akcije u MVP (samo pregled)

3. **Poslovi**
   - Pretraga po naslovu, filter po statusu
   - Akcija: "Zatvori posao" (status → closed)
   - Confirm modal pre akcije

4. **Korisnici**
   - Lista profila
   - Akcija: Deaktiviraj / Aktiviraj (profiles.deactivated)
   - Deaktivirani korisnik vidi banner "Nalog je deaktiviran." i ne može objavljivati poslove, slati ponude niti poruke

5. **Ocjene**
   - Lista ocjena
   - Akcija: Sakrij / Prikaži (reviews.is_hidden)
   - Sakrivene ocjene se ne prikazuju na `/izvodjac/[id]`

## Security sanity checks (RLS)

- **profiles**: SELECT vlastiti; admin SELECT sve; UPDATE vlastiti; admin UPDATE deactivated
- **jobs**: SELECT published ili vlastiti (client_id); admin SELECT sve; INSERT client; UPDATE client ili admin (status closed)
- **proposals**: SELECT client posla ili freelancer; INSERT freelancer; UPDATE client posla
- **contracts**: SELECT učesnici; INSERT client; UPDATE učesnici
- **conversations, messages**: SELECT/INSERT samo učesnici ugovora
- **reviews**: SELECT javno; INSERT učesnici završenog ugovora; admin UPDATE is_hidden
- **reports**: INSERT authenticated (reporter_id = auth.uid()); SELECT vlastiti ili admin

## Navigacija (Upwork-like)

- **Header**: sticky top bar
  - Brand: izvođači → `/jobs`
  - Tabs: Poslovi, Inbox, Ugovori, Moji poslovi (client), Moje ponude (freelancer), Admin (admin)
  - Search → `/jobs?q=...`
  - Objavi posao / Prijavi se / Registruj se / Profil dropdown

- **Bez sidebara** na javnim stranicama; filteri u levom stupcu na `/jobs`
