-- =============================================================================
-- Migration 00014: Direct Messaging & Community
-- Extends existing conversations/messages for 1-1 direct messaging,
-- adds conversation_participants for unified access control,
-- adds community_posts + community_comments with RLS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend conversations: add type + pair_key, make contract_id nullable
-- ---------------------------------------------------------------------------
ALTER TABLE conversations ALTER COLUMN contract_id DROP NOT NULL;

ALTER TABLE conversations
  ADD COLUMN type text NOT NULL DEFAULT 'contract'
    CHECK (type IN ('contract', 'direct'));

ALTER TABLE conversations
  ADD COLUMN pair_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_pair_key
  ON conversations (pair_key) WHERE pair_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. conversation_participants — single source of "who is in this chat"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid   NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_user ON conversation_participants (user_id);

-- ---------------------------------------------------------------------------
-- 3. Backfill participants for existing contract conversations
-- ---------------------------------------------------------------------------
INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
SELECT c.id, ct.client_id, c.created_at
FROM conversations c
JOIN contracts ct ON ct.id = c.contract_id
WHERE c.type = 'contract'
ON CONFLICT DO NOTHING;

INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
SELECT c.id, ct.freelancer_id, c.created_at
FROM conversations c
JOIN contracts ct ON ct.id = c.contract_id
WHERE c.type = 'contract'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Trigger: auto-populate participants when a contract conversation is created
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_add_contract_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'contract' AND NEW.contract_id IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id)
    SELECT NEW.id, ct.client_id
    FROM contracts ct WHERE ct.id = NEW.contract_id
    ON CONFLICT DO NOTHING;

    INSERT INTO conversation_participants (conversation_id, user_id)
    SELECT NEW.id, ct.freelancer_id
    FROM contracts ct WHERE ct.id = NEW.contract_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_add_contract_participants
  AFTER INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION auto_add_contract_participants();

-- ---------------------------------------------------------------------------
-- 5. RPC: get_or_create_direct_conversation
--    Returns existing or new conversation id for a 1-1 direct chat.
--    Deterministic pair_key prevents duplicate conversations.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_or_create_direct_conversation(other_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair_key text;
  v_conv_id  bigint;
  v_my_id    uuid;
BEGIN
  v_my_id := auth.uid();
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_my_id = other_user_id THEN
    RAISE EXCEPTION 'Cannot message yourself';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = other_user_id AND (deactivated IS NULL OR deactivated = false)) THEN
    RAISE EXCEPTION 'User not found or deactivated';
  END IF;

  v_pair_key := least(v_my_id::text, other_user_id::text)
             || ':'
             || greatest(v_my_id::text, other_user_id::text);

  SELECT id INTO v_conv_id FROM conversations WHERE pair_key = v_pair_key;
  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  INSERT INTO conversations (type, pair_key)
  VALUES ('direct', v_pair_key)
  RETURNING id INTO v_conv_id;

  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES (v_conv_id, v_my_id);
  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES (v_conv_id, other_user_id);

  RETURN v_conv_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC: get_unread_counts — returns unread message count per conversation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_unread_counts()
RETURNS TABLE (conversation_id bigint, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.conversation_id,
    COUNT(m.id) AS unread_count
  FROM conversation_participants cp
  LEFT JOIN messages m
    ON  m.conversation_id = cp.conversation_id
    AND m.created_at > cp.last_read_at
    AND m.sender_id != auth.uid()
  WHERE cp.user_id = auth.uid()
  GROUP BY cp.conversation_id;
$$;

-- ---------------------------------------------------------------------------
-- 7. Updated RLS — conversations (use conversation_participants as source)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "conversations_select_participants" ON conversations;
CREATE POLICY "conversations_select_participants" ON conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversations.id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "conversations_insert_client" ON conversations;
CREATE POLICY "conversations_insert_contract" ON conversations
  FOR INSERT WITH CHECK (
    type = 'contract'
    AND EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = contract_id
        AND c.client_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Updated RLS — messages (unified via conversation_participants)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "messages_select_participants" ON messages;
CREATE POLICY "messages_select_participants" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages_insert_participants" ON messages;
CREATE POLICY "messages_insert_participants" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 9. RLS — conversation_participants
-- ---------------------------------------------------------------------------
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cp_select_own" ON conversation_participants
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "cp_update_own" ON conversation_participants
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 10. Anti-spam constraints on messages
-- ---------------------------------------------------------------------------
ALTER TABLE messages
  ADD CONSTRAINT messages_text_max_length
    CHECK (char_length(text) <= 2000) NOT VALID;

ALTER TABLE messages
  ADD CONSTRAINT messages_text_not_empty
    CHECK (char_length(trim(text)) > 0) NOT VALID;

-- ---------------------------------------------------------------------------
-- 11. Rate-limit trigger for messages (max 20 per minute)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_message_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count int;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM messages
  WHERE sender_id = NEW.sender_id
    AND created_at > now() - interval '1 minute';

  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 20 messages per minute';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_message_rate_limit
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION check_message_rate_limit();

-- Better index for message queries (keyset pagination)
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages (conversation_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 12. Community posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      text,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_posts_body_max_length CHECK (char_length(body) <= 5000),
  CONSTRAINT community_posts_body_not_empty  CHECK (char_length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_created
  ON community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author
  ON community_posts (author_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_community_posts_updated_at
  BEFORE UPDATE ON community_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Post rate limit (max 3 per 5 minutes)
CREATE OR REPLACE FUNCTION check_post_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count int;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM community_posts
  WHERE author_id = NEW.author_id
    AND created_at > now() - interval '5 minutes';

  IF recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 3 posts per 5 minutes';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_post_rate_limit
  BEFORE INSERT ON community_posts
  FOR EACH ROW EXECUTE FUNCTION check_post_rate_limit();

-- RLS for community_posts: public read, authenticated write (author only)
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_posts_select_all" ON community_posts
  FOR SELECT USING (true);

CREATE POLICY "community_posts_insert_auth" ON community_posts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid());

CREATE POLICY "community_posts_update_author" ON community_posts
  FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY "community_posts_delete_author" ON community_posts
  FOR DELETE USING (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 13. Community comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_comments_body_max_length CHECK (char_length(body) <= 2000),
  CONSTRAINT community_comments_body_not_empty  CHECK (char_length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post
  ON community_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_comments_author
  ON community_comments (author_id);

-- Comment rate limit (max 10 per minute)
CREATE OR REPLACE FUNCTION check_comment_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count int;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM community_comments
  WHERE author_id = NEW.author_id
    AND created_at > now() - interval '1 minute';

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 10 comments per minute';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_comment_rate_limit
  BEFORE INSERT ON community_comments
  FOR EACH ROW EXECUTE FUNCTION check_comment_rate_limit();

-- RLS for community_comments: public read, authenticated write (author only)
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_comments_select_all" ON community_comments
  FOR SELECT USING (true);

CREATE POLICY "community_comments_insert_auth" ON community_comments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid());

CREATE POLICY "community_comments_update_author" ON community_comments
  FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY "community_comments_delete_author" ON community_comments
  FOR DELETE USING (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 14. Enable Supabase Realtime for messages and community tables
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_comments;
  END IF;
END;
$$;
