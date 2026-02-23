-- =============================================================================
-- Migration 00015: Fix DM conversation FK on conversation_participants
-- Root cause: insert into conversation_participants(user_id) can use auth.uid()
-- or other_user_id; if either is missing from profiles, FK fails.
-- This migration: ensure get_or_create_direct_conversation verifies BOTH
-- current user and selected user exist in profiles before any insert.
-- =============================================================================

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

  -- Both users must have a profile row (avoids conversation_participants_user_id_fkey)
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_my_id) THEN
    RAISE EXCEPTION 'Your profile is missing. Please complete signup or refresh the page.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = other_user_id) THEN
    RAISE EXCEPTION 'Selected user has no profile.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'deactivated'
  ) THEN
    IF EXISTS (SELECT 1 FROM profiles WHERE id = other_user_id AND (deactivated IS TRUE)) THEN
      RAISE EXCEPTION 'User not found or deactivated';
    END IF;
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
