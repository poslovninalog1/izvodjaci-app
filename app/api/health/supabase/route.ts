import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const urlOk = /^https?:\/\/.+/.test(url);
  const anonKeyOk = anonKey.split(".").length === 3;
  const serviceKeyOk = serviceKey.split(".").length === 3;

  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    host = url ? "(invalid URL)" : "(empty)";
  }

  let reachable = false;
  let reachError = "";
  if (urlOk) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, {
        signal: AbortSignal.timeout(5000),
      });
      reachable = res.ok;
      if (!res.ok) reachError = `HTTP ${res.status}`;
    } catch (err) {
      reachError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({
    ok: urlOk && anonKeyOk && reachable,
    host,
    url_valid: urlOk,
    anon_key_valid: anonKeyOk,
    service_key_present: serviceKeyOk,
    supabase_reachable: reachable,
    reach_error: reachError || undefined,
  });
}
