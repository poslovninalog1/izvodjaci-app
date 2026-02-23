-- =============================================================================
-- Single idempotent script: Direct Messaging Inbox + Community (RLS, RPCs, Realtime)
-- Run once in Supabase Dashboard → SQL Editor. Safe to re-run if partially applied.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) INBOX — Conversations (UUID-based; contract_id optional if contracts exists)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'contract')),
  pair_key    text,
  contract_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_pair_key
  ON public.conversations (pair_key) WHERE pair_key IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contracts') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'conversations' AND constraint_name = 'conversations_contract_id_fkey') THEN
      ALTER TABLE public.conversations
        ADD CONSTRAINT conversations_contract_id_fkey
        FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- A) conversation_participants
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid NOT NULL,
  user_id         uuid NOT NULL,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'conversation_participants' AND constraint_name = 'conversation_participants_conversation_id_fkey') THEN
    ALTER TABLE public.conversation_participants
      ADD CONSTRAINT conversation_participants_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'conversation_participants' AND constraint_name = 'conversation_participants_user_id_fkey') THEN
      ALTER TABLE public.conversation_participants
        ADD CONSTRAINT conversation_participants_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id
  ON public.conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_last_read
  ON public.conversation_participants (conversation_id, user_id);

-- -----------------------------------------------------------------------------
-- A) messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_id       uuid NOT NULL,
  text            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_text_max_length CHECK (char_length(text) <= 2000),
  CONSTRAINT messages_text_not_empty   CHECK (char_length(trim(text)) > 0)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'messages' AND constraint_name = 'messages_conversation_id_fkey') THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- A) RPC: get_or_create_direct_conversation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair_key text;
  v_conv_id  uuid;
  v_my_id    uuid;
BEGIN
  v_my_id := auth.uid();
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_my_id = other_user_id THEN
    RAISE EXCEPTION 'Cannot message yourself';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = other_user_id) THEN
      RAISE EXCEPTION 'User not found';
    END IF;
  END IF;

  v_pair_key := least(v_my_id::text, other_user_id::text) || ':' || greatest(v_my_id::text, other_user_id::text);

  SELECT id INTO v_conv_id FROM public.conversations WHERE pair_key = v_pair_key;
  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  INSERT INTO public.conversations (type, pair_key)
  VALUES ('direct', v_pair_key)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv_id, v_my_id), (v_conv_id, other_user_id);

  RETURN v_conv_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- A) RPC: get_unread_counts
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_counts()
RETURNS TABLE (conversation_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.conversation_id,
    COUNT(m.id) AS unread_count
  FROM public.conversation_participants cp
  LEFT JOIN public.messages m
    ON m.conversation_id = cp.conversation_id
   AND m.created_at > cp.last_read_at
   AND m.sender_id <> auth.uid()
  WHERE cp.user_id = auth.uid()
  GROUP BY cp.conversation_id;
$$;

-- -----------------------------------------------------------------------------
-- A) Trigger: message rate limit (20/min per user)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_message_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count int;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.messages
  WHERE sender_id = NEW.sender_id
    AND created_at > now() - interval '1 minute';
  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 20 messages per minute';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_rate_limit ON public.messages;
CREATE TRIGGER trg_message_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.check_message_rate_limit();

-- -----------------------------------------------------------------------------
-- A) RLS — conversations
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_participants" ON public.conversations;
CREATE POLICY "conversations_select_participants" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "conversations_insert_contract" ON public.conversations;
CREATE POLICY "conversations_insert_contract" ON public.conversations
  FOR INSERT WITH CHECK (
    type = 'contract'
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contracts')
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND c.client_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- A) RLS — conversation_participants
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cp_select_own" ON public.conversation_participants;
CREATE POLICY "cp_select_own" ON public.conversation_participants
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "cp_update_own" ON public.conversation_participants;
CREATE POLICY "cp_update_own" ON public.conversation_participants
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- A) RLS — messages
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
CREATE POLICY "messages_select_participants" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages_insert_participants" ON public.messages;
CREATE POLICY "messages_insert_participants" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- B) COMMUNITY — community_posts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid NOT NULL,
  title      text,
  body       text NOT NULL,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'members')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_posts_body_max_length CHECK (char_length(body) <= 5000),
  CONSTRAINT community_posts_body_not_empty   CHECK (char_length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_created_at
  ON public.community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author_id
  ON public.community_posts (author_id);

CREATE OR REPLACE FUNCTION public.set_community_posts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_posts_updated_at ON public.community_posts;
CREATE TRIGGER trg_community_posts_updated_at
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_community_posts_updated_at();

CREATE OR REPLACE FUNCTION public.check_post_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count int;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.community_posts
  WHERE author_id = NEW.author_id
    AND created_at > now() - interval '5 minutes';
  IF recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 3 posts per 5 minutes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_rate_limit ON public.community_posts;
CREATE TRIGGER trg_post_rate_limit
  BEFORE INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.check_post_rate_limit();

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_posts_select_public_or_members" ON public.community_posts;
CREATE POLICY "community_posts_select_public_or_members" ON public.community_posts
  FOR SELECT USING (
    visibility = 'public'
    OR (visibility = 'members' AND auth.uid() IS NOT NULL)
  );

DROP POLICY IF EXISTS "community_posts_insert_auth" ON public.community_posts;
CREATE POLICY "community_posts_insert_auth" ON public.community_posts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid());

DROP POLICY IF EXISTS "community_posts_update_author" ON public.community_posts;
CREATE POLICY "community_posts_update_author" ON public.community_posts
  FOR UPDATE USING (author_id = auth.uid());

DROP POLICY IF EXISTS "community_posts_delete_author" ON public.community_posts;
CREATE POLICY "community_posts_delete_author" ON public.community_posts
  FOR DELETE USING (author_id = auth.uid());

-- -----------------------------------------------------------------------------
-- B) COMMUNITY — community_comments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL,
  author_id  uuid NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE,
  CONSTRAINT community_comments_body_max_length CHECK (char_length(body) <= 2000),
  CONSTRAINT community_comments_body_not_empty   CHECK (char_length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post_created
  ON public.community_comments (post_id, created_at);

CREATE OR REPLACE FUNCTION public.check_comment_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count int;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.community_comments
  WHERE author_id = NEW.author_id
    AND created_at > now() - interval '1 minute';
  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 10 comments per minute';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_rate_limit ON public.community_comments;
CREATE TRIGGER trg_comment_rate_limit
  BEFORE INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.check_comment_rate_limit();

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_comments_select_all" ON public.community_comments;
CREATE POLICY "community_comments_select_all" ON public.community_comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "community_comments_insert_auth" ON public.community_comments;
CREATE POLICY "community_comments_insert_auth" ON public.community_comments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid());

DROP POLICY IF EXISTS "community_comments_delete_author" ON public.community_comments;
CREATE POLICY "community_comments_delete_author" ON public.community_comments
  FOR DELETE USING (author_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Realtime publication
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'community_posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'community_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Verification (run these manually to confirm)
-- -----------------------------------------------------------------------------
-- Tables + RLS:
--   SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r'
--     AND c.relname IN ('conversations', 'conversation_participants', 'messages', 'community_posts', 'community_comments')
--   ORDER BY c.relname;
-- RPCs:
--   SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'public'
--     AND routine_name IN ('get_or_create_direct_conversation', 'get_unread_counts');
-- Realtime:
--   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename IN ('messages', 'community_posts', 'community_comments');
