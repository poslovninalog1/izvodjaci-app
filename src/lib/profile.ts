/**
 * Get display name from profile.
 * Uses profile.name (actual schema); fallback to full_name if present, then "Korisnik".
 */
export function getDisplayName(profile: {
  full_name?: string | null;
  name?: string | null;
} | null | undefined): string {
  if (!profile) return "Korisnik";
  return (profile.name ?? profile.full_name ?? "Korisnik").trim() || "Korisnik";
}
