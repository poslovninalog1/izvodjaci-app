import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, createUserClient } from "@/src/lib/supabase/admin";

const SIGNED_URL_EXPIRY_SEC = 60 * 10; // 10 minutes

/**
 * GET /api/contracts/[id]/signed-pdf?bucket=...&path=...
 * Returns a signed URL for the contract acceptance PDF (from audit log).
 * User must be a party to the contract.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rawId = String(id ?? "");
  const contractId = /^\d+$/.test(rawId) ? parseInt(rawId, 10) : NaN;
  if (!contractId || isNaN(contractId)) {
    return NextResponse.json({ error: "Nevažeći ID ugovora." }, { status: 400 });
  }

  const bucket = req.nextUrl.searchParams.get("bucket") ?? "contracts";
  const path = req.nextUrl.searchParams.get("path");
  if (!path || !path.trim()) {
    return NextResponse.json({ error: "Parametar path je obavezan." }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  const supabaseUser = createUserClient(authHeader.replace(/^Bearer\s+/i, ""));

  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  const { data: contract } = await supabaseUser
    .from("contracts")
    .select("id, client_id, freelancer_id")
    .eq("id", contractId)
    .single();

  if (!contract) {
    return NextResponse.json({ error: "Ugovor nije pronađen ili nemate pristup." }, { status: 404 });
  }

  if (contract.client_id !== user.id && contract.freelancer_id !== user.id) {
    return NextResponse.json({ error: "Nemate pristup ovom ugovoru." }, { status: 403 });
  }

  const supabaseAdmin = getAdminClient();
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path.trim(), SIGNED_URL_EXPIRY_SEC);

  if (signErr || !signed?.signedUrl) {
    console.error("[signed-pdf] createSignedUrl failed:", signErr?.message ?? "no url");
    return NextResponse.json(
      { error: "Generisanje linka za preuzimanje nije uspjelo." },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: signed.signedUrl });
}
