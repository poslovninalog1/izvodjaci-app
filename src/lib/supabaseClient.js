import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
  const url = supabaseUrl || "";
  const projectRef = url ? url.replace(/^https:\/\//, "").split(".")[0] : "";
  console.log("[supabase] url:", url, "| projectRef:", projectRef, "| match this to Dashboard URL");
}
