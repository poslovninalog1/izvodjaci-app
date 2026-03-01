/**
 * Validates and exports Supabase env vars with clear error messages.
 * Safe to import from both client and server — only uses NEXT_PUBLIC_ vars.
 */

function isJwtShaped(val: string): boolean {
  const parts = val.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 10);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const errors: string[] = [];

if (!url) {
  errors.push("NEXT_PUBLIC_SUPABASE_URL is missing.");
} else if (!/^https?:\/\/.+/.test(url)) {
  errors.push(`NEXT_PUBLIC_SUPABASE_URL is invalid (got "${url}"). Must start with https://`);
}

if (!anonKey) {
  errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
} else if (!isJwtShaped(anonKey)) {
  errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is not a valid JWT (expected 3 dot-separated parts).");
}

if (errors.length > 0) {
  const msg = `[supabase/env] ❌ Environment validation failed:\n  • ${errors.join("\n  • ")}\n\nFix .env.local and restart the dev server.`;
  console.error(msg);
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;
export const ENV_VALID = errors.length === 0;
export const ENV_ERRORS = errors;

export function maskUrl(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u ? u.slice(0, 30) + "..." : "(empty)";
  }
}
