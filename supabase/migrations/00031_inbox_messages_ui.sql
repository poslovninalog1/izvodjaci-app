-- =============================================================================
-- Inbox Messages UI: v_inbox_threads with other_user_id, last_message_text/type,
-- and indexes for fast sidebar + unread counts.
-- RLS-safe: security_invoker = true so view respects conversation_participants.
-- =============================================================================

-- Index for conversation_participants lookups by user and conversation
CREATE INDEX IF NOT EXISTS idx_cp_user_conversation
  ON public.conversation_participants (user_id, conversation_id);

-- messages(conversation_id, created_at DESC) already exists as idx_messages_conv_created (00014)

-- -----------------------------------------------------------------------------
-- v_inbox_threads: one row per (user_id, conversation_id) with other party info,
-- last message, and unread count. Columns:
--   user_id, conversation_id, other_user_id, other_user_name,
--   last_message_text, last_message_type, last_message_at, last_message_preview, unread_count
-- -----------------------------------------------------------------------------
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
-- Other participant: id + display name (direct = other profile, contract = other from contract)
other_party AS (
  SELECT
    c.id AS conversation_id,
    cp.user_id,
    CASE
      WHEN c.type = 'direct' AND c.pair_key IS NOT NULL THEN
        (SELECT cp2.user_id
         FROM public.conversation_participants cp2
         WHERE cp2.conversation_id = c.id AND cp2.user_id <> cp.user_id
         LIMIT 1)
      WHEN c.type = 'contract' AND c.contract_id IS NOT NULL THEN
        (SELECT CASE WHEN ct.client_id = cp.user_id THEN ct.freelancer_id ELSE ct.client_id END
         FROM public.contracts ct
         WHERE ct.id = c.contract_id
         LIMIT 1)
      ELSE NULL
    END AS other_user_id,
    CASE
      WHEN c.type = 'direct' AND c.pair_key IS NOT NULL THEN
        (SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'Korisnik')
         FROM public.conversation_participants cp2
         JOIN public.profiles p ON p.id = cp2.user_id
         WHERE cp2.conversation_id = c.id AND cp2.user_id <> cp.user_id
         LIMIT 1)
      WHEN c.type = 'contract' AND c.contract_id IS NOT NULL THEN
        (SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'Korisnik')
         FROM public.contracts ct
         JOIN public.profiles p ON p.id = CASE WHEN ct.client_id = cp.user_id THEN ct.freelancer_id ELSE ct.client_id END
         WHERE ct.id = c.contract_id
         LIMIT 1)
      ELSE 'Korisnik'
    END AS other_user_name
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id
)
SELECT
  cp.user_id,
  cp.conversation_id,
  op.other_user_id,
  op.other_user_name AS other_user_name,
  op.other_user_name AS title,
  lm.last_message_text,
  lm.last_message_type,
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
JOIN other_party op ON op.conversation_id = cp.conversation_id AND op.user_id = cp.user_id
LEFT JOIN last_msg lm ON lm.conversation_id = cp.conversation_id
LEFT JOIN unread u ON u.conversation_id = cp.conversation_id AND u.user_id = cp.user_id;

COMMENT ON VIEW public.v_inbox_threads IS 'Inbox threads per user: other_user_id, other_user_name, last message text/type/at, unread_count (RLS via security_invoker).';

GRANT SELECT ON public.v_inbox_threads TO authenticated;

-- =============================================================================
-- SANITY CHECKLIST (run in Supabase SQL editor as authenticated user)
-- =============================================================================
-- 1. List threads for current user:
--    SELECT * FROM v_inbox_threads WHERE user_id = auth.uid() ORDER BY last_message_at DESC LIMIT 20;
-- 2. Check unread counts: unread_count should be 0 after opening a conversation
--    and calling UPDATE conversation_participants SET last_read_at = now() WHERE ...
-- 3. Verify RLS: as the same user, SELECT from v_inbox_threads should only return
--    rows for conversations they participate in.
-- 4. After mark-as-read, re-run (1) and confirm unread_count = 0 for that conversation.
