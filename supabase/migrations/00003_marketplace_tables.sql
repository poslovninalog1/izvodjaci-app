-- =============================================================================
-- Phase 2: Proposals, Contracts, Messaging, Reviews, Reports
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Proposals
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposals (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cover_letter text NOT NULL,
  proposed_rate numeric,
  proposed_fixed numeric,
  status text DEFAULT 'submitted' CHECK (status IN ('submitted', 'shortlisted', 'rejected', 'hired')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (job_id, freelancer_id)
);

CREATE INDEX IF NOT EXISTS idx_proposals_job ON proposals (job_id);
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer ON proposals (freelancer_id);

-- -----------------------------------------------------------------------------
-- Contracts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES profiles(id),
  freelancer_id uuid NOT NULL REFERENCES profiles(id),
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_contracts_job ON contracts (job_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts (client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer ON contracts (freelancer_id);

-- -----------------------------------------------------------------------------
-- Conversations (one per contract)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id bigserial PRIMARY KEY,
  contract_id bigint NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (contract_id)
);

-- -----------------------------------------------------------------------------
-- Messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id bigserial PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id);

-- -----------------------------------------------------------------------------
-- Reviews
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id bigserial PRIMARY KEY,
  contract_id bigint NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id),
  reviewee_id uuid NOT NULL REFERENCES profiles(id),
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (contract_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_contract ON reviews (contract_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews (reviewee_id);

-- -----------------------------------------------------------------------------
-- Reports
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id bigserial PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES profiles(id),
  target_type text NOT NULL CHECK (target_type IN ('profile', 'job', 'message', 'review')),
  target_id text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_target ON reports (target_type, target_id);

-- -----------------------------------------------------------------------------
-- Admin actions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_actions (
  id bigserial PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES profiles(id),
  action_type text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions (admin_id);
