-- =============================================================================
-- Drop overly-broad dev RLS policies that allow any logged-in user to read
-- ALL conversations/messages (inbox privacy bug).
-- After this, only membership-based SELECT policies apply.
-- =============================================================================

DROP POLICY IF EXISTS "conversations_dev" ON public.conversations;
DROP POLICY IF EXISTS "messages_dev" ON public.messages;

-- Verify: list remaining policies (run manually if needed):
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('conversations', 'messages');
