-- =============================================================================
-- View: v_inbox_threads
-- Single source for inbox sidebar: threads with other_user_name, last message
-- preview (text or attachment label), last_message_at, unread_count.
-- Unread = messages where sender <> current user AND created_at > last_read_at
-- (strictly >, never count own messages).
-- =============================================================================

DROP VIEW IF EXISTS public.v_inbox_threads;

CREATE VIEW public.v_inbox_threads
WITH (security_invoker = false)
AS
WITH cp AS (
  SELECT
    conversation_id,
    user_id,
    COALESCE(last_read_at, '1970-01-01'::timestamptz) AS last_read_at
  FROM public.conversation_participants
),
-- Last message per conversation (for preview and time)
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
-- Unread count: messages from others after last_read_at (strict >, exclude own)
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
-- Other participant display name: direct = other profile, contract = other from contract
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

COMMENT ON VIEW public.v_inbox_threads IS 'Inbox threads per user: other_user_name, last message preview, unread_count (messages from others with created_at > last_read_at).';

-- Grant so authenticated can select (RLS on underlying tables applies via security_invoker = false we use definer semantics; or use security_invoker = true and rely on RLS)
GRANT SELECT ON public.v_inbox_threads TO authenticated;
