-- =============================================================================
-- Migration 00018: RLS policies for conversation_participants (fix 42501)
-- Ensures SELECT/UPDATE/INSERT so mark-as-read and inbox list work.
-- =============================================================================

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cp_select_own" ON public.conversation_participants;
CREATE POLICY "cp_select_own" ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "cp_update_own" ON public.conversation_participants;
CREATE POLICY "cp_update_own" ON public.conversation_participants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "cp_insert_self" ON public.conversation_participants;
CREATE POLICY "cp_insert_self" ON public.conversation_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
