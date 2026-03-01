-- =============================================================================
-- 00025: Allow reading other participants in conversations we're in
--       (so sidebar can resolve other user's full_name from profiles)
--       FIX: Avoid 42P17 infinite recursion. Cannot use EXISTS (SELECT FROM
--       conversation_participants) in cp's own USING; using EXISTS (SELECT FROM
--       conversations) would recurse too because conversations RLS references cp.
--       So we use a SECURITY DEFINER function to check membership without RLS.
-- =============================================================================

-- Drop the recursive policy (queries conversation_participants inside its own USING)
DROP POLICY IF EXISTS "cp_select_participants_in_my_conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_select_if_conversation_visible" ON public.conversation_participants;

-- Keep existing cp_select_own, cp_update_own, cp_insert_self untouched.

-- Returns true if auth.uid() is a participant in the given conversation.
-- SECURITY DEFINER bypasses RLS so the policy on cp does not recurse.
CREATE OR REPLACE FUNCTION public.user_is_conversation_participant(conv_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conv_id AND user_id = auth.uid()
  );
$$;

-- Allow SELECT on conversation_participants if the current user is in that conversation.
CREATE POLICY "cp_select_if_conversation_visible" ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (public.user_is_conversation_participant(conversation_id));
