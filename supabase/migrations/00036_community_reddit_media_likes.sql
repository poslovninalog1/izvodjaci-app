-- =============================================================================
-- Community Reddit-style: post media, likes, comment likes, threaded comments,
-- post shares.
-- Create storage bucket "community-media" in Supabase Dashboard:
--   - Public bucket (or allow public read) so getPublicUrl works
--   - RLS: allow authenticated to upload/delete their own paths
-- =============================================================================

-- Post media: images and video, ordered (carousel)
CREATE TABLE IF NOT EXISTS public.community_post_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('image', 'video')),
  path        text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_post_media_post
  ON public.community_post_media (post_id, sort_order);

ALTER TABLE public.community_post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_post_media_select_all" ON public.community_post_media
  FOR SELECT USING (true);

CREATE POLICY "community_post_media_insert_auth" ON public.community_post_media
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND p.author_id = auth.uid()
    )
  );

CREATE POLICY "community_post_media_delete_author" ON public.community_post_media
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND p.author_id = auth.uid()
    )
  );

-- Post likes (upvote)
CREATE TABLE IF NOT EXISTS public.community_post_likes (
  post_id     uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_post_likes_user
  ON public.community_post_likes (user_id);

ALTER TABLE public.community_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_post_likes_select_all" ON public.community_post_likes
  FOR SELECT USING (true);

CREATE POLICY "community_post_likes_insert_auth" ON public.community_post_likes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "community_post_likes_delete_own" ON public.community_post_likes
  FOR DELETE USING (user_id = auth.uid());

-- Threaded comments: add parent_id
ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_community_comments_parent
  ON public.community_comments (parent_id) WHERE parent_id IS NOT NULL;

-- Comment likes
CREATE TABLE IF NOT EXISTS public.community_comment_likes (
  comment_id  uuid NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_comment_likes_user
  ON public.community_comment_likes (user_id);

ALTER TABLE public.community_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_comment_likes_select_all" ON public.community_comment_likes
  FOR SELECT USING (true);

CREATE POLICY "community_comment_likes_insert_auth" ON public.community_comment_likes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "community_comment_likes_delete_own" ON public.community_comment_likes
  FOR DELETE USING (user_id = auth.uid());

-- Post shares (track share to partner / to community; optional for analytics)
CREATE TABLE IF NOT EXISTS public.community_post_shares (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id               uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_with_user_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  shared_to_community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_post_shares_post
  ON public.community_post_shares (post_id);

ALTER TABLE public.community_post_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_post_shares_select_all" ON public.community_post_shares
  FOR SELECT USING (true);

CREATE POLICY "community_post_shares_insert_auth" ON public.community_post_shares
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Grants
GRANT SELECT, INSERT, DELETE ON public.community_post_media TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_post_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_comment_likes TO authenticated;
GRANT SELECT, INSERT ON public.community_post_shares TO authenticated;

-- Allow empty body when post has media (optional: drop strict not_empty)
ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_body_not_empty;

COMMENT ON TABLE public.community_post_media IS 'Media attachments for community posts (storage path in bucket community-media).';
COMMENT ON TABLE public.community_post_likes IS 'Like/upvote on community posts.';
COMMENT ON TABLE public.community_comment_likes IS 'Like on community comments.';
COMMENT ON TABLE public.community_post_shares IS 'Share tracking: to partner (shared_with_user_id) or to community (shared_to_community_id).';
