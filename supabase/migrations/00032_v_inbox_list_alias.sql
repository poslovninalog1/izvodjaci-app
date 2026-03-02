-- =============================================================================
-- v_inbox_list: alias view for sidebar (conversation_id, other_display_name,
-- last_message_text, last_message_created_at, unread_count).
-- Unread counts are derived from v_inbox_threads (same source as v_unread logic).
-- =============================================================================

DROP VIEW IF EXISTS public.v_inbox_list;

CREATE VIEW public.v_inbox_list
WITH (security_invoker = true)
AS
SELECT
  user_id,
  conversation_id,
  other_user_id,
  other_user_name AS other_display_name,
  last_message_text,
  last_message_at AS last_message_created_at,
  last_message_preview,
  unread_count
FROM public.v_inbox_threads;

COMMENT ON VIEW public.v_inbox_list IS 'Inbox list for sidebar; alias of v_inbox_threads. unread_count from same view.';

GRANT SELECT ON public.v_inbox_list TO authenticated;
