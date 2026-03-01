/**
 * Server-only Supabase admin client — uses service_role key.
 * NEVER import this from a "use client" component.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!serviceRoleKey && typeof window === "undefined") {
  console.error(
    "[supabase/admin] SUPABASE_SERVICE_ROLE_KEY is missing. " +
    "Server actions that need admin access will fail."
  );
}

let _admin: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export function hasServiceKey(): boolean {
  return serviceRoleKey.length > 0;
}

export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
