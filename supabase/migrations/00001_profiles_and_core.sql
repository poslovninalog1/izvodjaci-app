-- =============================================================================
-- Phase 2: Izvodjaci Marketplace — Core schema
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Categories (reference data)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id bigserial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  sort_order int DEFAULT 0
);

-- -----------------------------------------------------------------------------
-- 2. Cities (reference data)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cities (
  id bigserial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  sort_order int DEFAULT 0
);

-- -----------------------------------------------------------------------------
-- 3. Profiles (extends auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text CHECK (role IN ('client', 'freelancer', 'admin')),
  full_name text,
  city text,
  phone text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. Freelancer profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freelancer_profiles (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  title text,
  bio text,
  skills text[] DEFAULT '{}',
  hourly_rate numeric,
  portfolio_links text[] DEFAULT '{}',
  verified_badge boolean DEFAULT false
);

-- -----------------------------------------------------------------------------
-- 5. Client profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_profiles (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  company_name text
);
