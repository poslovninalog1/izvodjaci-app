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

/** Message type for attachments derived from MIME. */
export type AttachmentMessageType = "image" | "video" | "audio" | "file";

export function getMessageTypeFromMime(mime: string): AttachmentMessageType {
  if (!mime || typeof mime !== "string") return "file";
  const lower = mime.toLowerCase().trim();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("video/")) return "video";
  if (lower.startsWith("audio/")) return "audio";
  return "file";
}

/** Sanitize filename for storage path: basename, safe chars only. */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== "string") return "file";
  const base = filename.replace(/^.*[/\\]/, "").trim() || "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}
