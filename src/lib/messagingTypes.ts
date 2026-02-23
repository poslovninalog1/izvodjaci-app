/**
 * Shared types for inbox/DM messaging.
 * All user references use UUID profile.id from public.profiles.
 */

export type ProfileSearchResult = {
  id: string;
  displayName: string;
};

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidProfileId(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

/** conversation_id from DB is bigint; URL param must stay string. Validate with regex only. */
const CONVERSATION_ID_REGEX = /^[0-9]+$/;
export function isValidConversationId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && CONVERSATION_ID_REGEX.test(id);
}
