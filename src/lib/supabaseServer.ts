// Re-export from new module for backwards compatibility.
// All new code should import from "@/src/lib/supabase/admin".
export { getAdminClient as supabaseAdmin } from "./supabase/admin";
