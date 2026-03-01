import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, createUserClient } from "@/src/lib/supabase/admin";

const BUCKET = "contracts";
const SIGNED_URL_EXPIRY_SEC = 600; // 10 minutes

/**
 * GET /api/contracts/[id]/pdf
 * Returns signed URL for contract PDF at contracts/contract/{id}/v1.pdf.
 * User must be a party to the contract. Returns 404 if file does not exist.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: param } = await params;
  const id = /^\d+$/.test(param ?? "") ? parseInt(param!, 10) : NaN;
  if (!id || isNaN(id)) {
    return NextResponse.json({ error: "Nevažeći ID ugovora." }, { status: 400 });
  }

  const authHeader = _req.headers.get("authorization");
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
    .eq("id", id)
    .single();

  if (!contract) {
    return NextResponse.json({ error: "Ugovor nije pronađen ili nemate pristup." }, { status: 404 });
  }

  if (contract.client_id !== user.id && contract.freelancer_id !== user.id) {
    return NextResponse.json({ error: "Nemate pristup ovom ugovoru." }, { status: 403 });
  }

  const path = `contract/${id}/v1.pdf`;
  const supabaseAdmin = getAdminClient();
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "PDF nije pronađen." }, { status: 404 });
  }

  return NextResponse.json({ signedUrl: signed.signedUrl });
}
