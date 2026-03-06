-- =============================================================================
-- Post reactions: add reaction_type to community_post_likes (like, heart, fire, laugh, wow).
-- One reaction per user per post; user can update to change or delete to remove.
-- =============================================================================

ALTER TABLE public.community_post_likes
  ADD COLUMN IF NOT EXISTS reaction_type text NOT NULL DEFAULT 'like'
  CHECK (reaction_type IN ('like', 'heart', 'fire', 'laugh', 'wow'));

CREATE POLICY "community_post_likes_update_own" ON public.community_post_likes
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT UPDATE ON public.community_post_likes TO authenticated;

COMMENT ON COLUMN public.community_post_likes.reaction_type IS 'Emoji reaction: like, heart, fire, laugh, wow.';
