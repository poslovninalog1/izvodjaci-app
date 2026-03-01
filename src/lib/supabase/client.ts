/**
 * Browser (client-side) Supabase client — singleton.
 * Uses NEXT_PUBLIC_ env vars only. Safe for "use client" components.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, ENV_VALID, maskUrl } from "./env";

let _client: SupabaseClient | null = null;

function getBrowserClient(): SupabaseClient {
  if (_client) return _client;

  if (!ENV_VALID) {
    console.error(
      "[supabase/client] Creating client with invalid env. Requests will fail. " +
      "Check .env.local and restart dev server."
    );
  }

  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    console.log("[supabase/client] init →", maskUrl(SUPABASE_URL));
  }

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _client;
}

export const supabase = getBrowserClient();
