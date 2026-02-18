-- =============================================================================
-- Phase 2: Seed cities and categories (Montenegro)
-- =============================================================================

-- Cities (slug: lowercase, hyphenated)
INSERT INTO cities (slug, name, sort_order) VALUES
  ('podgorica', 'Podgorica', 1),
  ('niksic', 'Nikšić', 2),
  ('bar', 'Bar', 3),
  ('budva', 'Budva', 4),
  ('herceg-novi', 'Herceg Novi', 5),
  ('kotor', 'Kotor', 6),
  ('tivat', 'Tivat', 7),
  ('bijelo-polje', 'Bijelo Polje', 8),
  ('cetinje', 'Cetinje', 9),
  ('pljevlja', 'Pljevlja', 10)
ON CONFLICT (slug) DO NOTHING;

-- Categories (slug: latin, lowercase, hyphen)
INSERT INTO categories (slug, name, sort_order) VALUES
  ('gradjevina-majstori', 'Građevina/Majstori', 1),
  ('elektroinstalacije', 'Elektroinstalacije', 2),
  ('vodoinstalater', 'Vodoinstalater', 3),
  ('klimatizacija-i-grijanje', 'Klimatizacija i grijanje', 4),
  ('stolarija', 'Stolarija', 5),
  ('prevoz-selidbe', 'Prevoz/Selidbe', 6),
  ('it-web', 'IT & Web', 7),
  ('dizajn', 'Dizajn', 8),
  ('marketing', 'Marketing', 9),
  ('prevod-admin', 'Prevod/Admin', 10),
  ('foto-video', 'Foto/Video', 11),
  ('ciscenje', 'Čišćenje', 12)
ON CONFLICT (slug) DO NOTHING;
