-- =============================================================================
-- ONE-TIME FULL SUPABASE MIGRATION
-- Run this entire file in Supabase SQL Editor (or psql) once.
-- Covers: proposals (grants, client_id trigger, RLS, v_proposals), 
--         profiles.active_role + set_active_role RPC,
--         inbox privacy (v_inbox_threads with security_invoker = true).
-- =============================================================================

-- ##############################################################################
-- PART 1: PROPOSALS
-- ##############################################################################

GRANT SELECT, INSERT ON public.proposals TO authenticated;
GRANT UPDATE ON public.proposals TO authenticated;

ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.profiles(id);

-- If your app uses status 'submitted', comment out the next line:
ALTER TABLE public.proposals ALTER COLUMN status SET DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.set_proposals_client_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL AND NEW.job_id IS NOT NULL THEN
    SELECT j.client_id INTO NEW.client_id FROM public.jobs j WHERE j.id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_proposals_client_id ON public.proposals;
CREATE TRIGGER trg_set_proposals_client_id
  BEFORE INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_proposals_client_id();

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposals_insert_freelancer" ON public.proposals;
CREATE POLICY "proposals_insert_freelancer" ON public.proposals
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND freelancer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id)
  );

DROP POLICY IF EXISTS "proposals_select" ON public.proposals;
CREATE POLICY "proposals_select" ON public.proposals
  FOR SELECT USING (
    freelancer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = proposals.job_id AND j.client_id = auth.uid()
    )
  );

CREATE OR REPLACE VIEW public.v_proposals AS
SELECT
  p.*,
  j.title AS job_title,
  pr.full_name AS freelancer_name
FROM public.proposals p
JOIN public.jobs j ON j.id = p.job_id
LEFT JOIN public.profiles pr ON pr.id = p.freelancer_id;

GRANT SELECT ON public.v_proposals TO authenticated;


-- ##############################################################################
-- PART 2: PROFILES.ACTIVE_ROLE + RPC
-- ##############################################################################

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_role text NOT NULL DEFAULT 'client';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_active_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_active_role_check
      CHECK (active_role IN ('client', 'freelancer'));
  END IF;
END $$;

UPDATE public.profiles
SET active_role = role
WHERE role IN ('client', 'freelancer')
  AND (active_role IS NULL OR active_role NOT IN ('client', 'freelancer'));

CREATE OR REPLACE FUNCTION public.set_active_role(new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_role IS NULL OR new_role NOT IN ('client', 'freelancer') THEN
    RAISE EXCEPTION 'active_role must be client or freelancer';
  END IF;
  UPDATE public.profiles
  SET active_role = new_role
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_role(text) TO authenticated;


-- ##############################################################################
-- PART 3: INBOX PRIVACY (v_inbox_threads)
-- ##############################################################################

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type text;

DROP VIEW IF EXISTS public.v_inbox_threads;

CREATE VIEW public.v_inbox_threads
WITH (security_invoker = true)
AS
WITH cp AS (
  SELECT
    conversation_id,
    user_id,
    COALESCE(last_read_at, '1970-01-01'::timestamptz) AS last_read_at
  FROM public.conversation_participants
),
last_msg AS (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    created_at AS last_message_at,
    text AS last_message_text,
    message_type AS last_message_type,
    sender_id AS last_sender_id
  FROM public.messages
  ORDER BY conversation_id, created_at DESC
),
unread AS (
  SELECT
    cp.conversation_id,
    cp.user_id,
    COUNT(m.id)::int AS unread_count
  FROM cp
  JOIN public.messages m
    ON  m.conversation_id = cp.conversation_id
    AND m.sender_id <> cp.user_id
    AND m.created_at > cp.last_read_at
  GROUP BY cp.conversation_id, cp.user_id
),
other_name AS (
  SELECT
    c.id AS conversation_id,
    cp.user_id,
    CASE
      WHEN c.type = 'direct' AND c.pair_key IS NOT NULL THEN
        (SELECT COALESCE(p.full_name, p.name, '—')
         FROM public.conversation_participants cp2
         JOIN public.profiles p ON p.id = cp2.user_id
         WHERE cp2.conversation_id = c.id AND cp2.user_id <> cp.user_id
         LIMIT 1)
      WHEN c.type = 'contract' AND c.contract_id IS NOT NULL THEN
        (SELECT COALESCE(p.full_name, p.name, '—')
         FROM public.contracts ct
         JOIN public.profiles p ON p.id = CASE WHEN ct.client_id = cp.user_id THEN ct.freelancer_id ELSE ct.client_id END
         WHERE ct.id = c.contract_id
         LIMIT 1)
      ELSE '—'
    END AS other_user_name
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id
)
SELECT
  cp.user_id,
  cp.conversation_id,
  oname.other_user_name AS other_user_name,
  oname.other_user_name AS title,
  lm.last_message_at,
  CASE
    WHEN lm.last_message_text IS NOT NULL AND trim(lm.last_message_text) <> '' THEN
      LEFT(trim(lm.last_message_text), 200)
    WHEN lm.last_message_type = 'image' THEN '📷 Slika'
    WHEN lm.last_message_type = 'video' THEN '🎥 Video'
    WHEN lm.last_message_type = 'audio' THEN '🎵 Audio'
    WHEN lm.last_message_type IS NOT NULL THEN '📎 Fajl'
    ELSE ''
  END AS last_message_preview,
  COALESCE(u.unread_count, 0) AS unread_count
FROM cp
JOIN other_name oname ON oname.conversation_id = cp.conversation_id AND oname.user_id = cp.user_id
LEFT JOIN last_msg lm ON lm.conversation_id = cp.conversation_id
LEFT JOIN unread u ON u.conversation_id = cp.conversation_id AND u.user_id = cp.user_id;

COMMENT ON VIEW public.v_inbox_threads IS 'Inbox threads per user (security_invoker=true so RLS restricts to current user).';

GRANT SELECT ON public.v_inbox_threads TO authenticated;


-- ##############################################################################
-- DONE. Optional sanity checks (run manually):
--   SELECT job_id, freelancer_id, client_id, status FROM public.proposals ORDER BY created_at DESC LIMIT 5;
--   SELECT id, role, active_role FROM public.profiles LIMIT 5;
--   SELECT * FROM public.v_inbox_threads WHERE user_id = auth.uid() LIMIT 5;
-- ##############################################################################
