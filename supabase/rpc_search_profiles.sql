-- Run in Supabase SQL Editor if profile search in Inbox "Nova poruka" returns no results.
-- Safe SECURITY DEFINER RPC so search works regardless of profiles RLS.

CREATE OR REPLACE FUNCTION public.search_profiles_for_inbox(query_text text)
RETURNS TABLE (id uuid, full_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND (p.deactivated IS NULL OR p.deactivated = false)
    AND (p.full_name IS NOT NULL AND p.full_name ILIKE '%' || trim(query_text) || '%')
  ORDER BY p.full_name
  LIMIT 10;
$$;
