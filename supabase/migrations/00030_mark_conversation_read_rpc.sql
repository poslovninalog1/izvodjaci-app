-- =============================================================================
-- RPC: mark_conversation_read(p_conversation_id bigint)
-- SECURITY DEFINER so it can update conversation_participants regardless of RLS.
-- Updates last_read_at for the current user's row in the given conversation.
-- conversations.id / conversation_participants.conversation_id are int8/bigint.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.conversation_participants
  SET last_read_at = now()
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION public.mark_conversation_read(bigint) IS
  'Marks the conversation as read for the current user. Returns number of rows updated (0 or 1).';

GRANT EXECUTE ON FUNCTION public.mark_conversation_read(bigint) TO authenticated;
