-- =============================================================================
-- 1) v_inbox_threads: robust other_user_name (never null/empty)
--    COALESCE(trim(full_name), 'Korisnik') - profiles may not have name/username
-- 2) RPC set_account_type for saving physical/legal (SECURITY DEFINER)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Recreate v_inbox_threads with robust fallback for other user display name
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
other_name AS (
  SELECT
    c.id AS conversation_id,
    cp.user_id,
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

COMMENT ON VIEW public.v_inbox_threads IS 'Inbox threads per user; other_user_name/title use COALESCE(trim(full_name), ''Korisnik'').';

GRANT SELECT ON public.v_inbox_threads TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. RPC set_account_type (SECURITY DEFINER) so frontend can set without RLS issues
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_account_type(new_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_type IS NULL OR new_type NOT IN ('physical', 'legal') THEN
    RAISE EXCEPTION 'account_type must be physical or legal';
  END IF;
  UPDATE public.profiles
  SET account_type = new_type
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_account_type(text) TO authenticated;
