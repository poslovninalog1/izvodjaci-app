-- =============================================================================
-- Communities + community_members; community_id on community_posts (nullable).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.communities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_members_user ON public.community_members (user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_community ON public.community_members (community_id);

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL;

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can read communities
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communities_select_all" ON public.communities;
CREATE POLICY "communities_select_all" ON public.communities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "communities_insert_auth" ON public.communities;
CREATE POLICY "communities_insert_auth" ON public.communities
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- RLS: members can read; authenticated can join (handled by app)
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "community_members_select_all" ON public.community_members;
CREATE POLICY "community_members_select_all" ON public.community_members
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "community_members_insert_auth" ON public.community_members;
CREATE POLICY "community_members_insert_auth" ON public.community_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT ON public.communities TO authenticated;
GRANT SELECT, INSERT ON public.community_members TO authenticated;

-- Seed default "Opšte" community (idempotent)
INSERT INTO public.communities (id, name, description)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Opšte', 'Opšta diskusija')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE public.communities IS 'Community groups for Zajednica; posts can optionally belong to a community.';
