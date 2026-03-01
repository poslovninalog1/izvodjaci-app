import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, createUserClient } from "@/src/lib/supabase/admin";

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

  const versionParam = req.nextUrl.searchParams.get("version");
  const version = versionParam ? Number(versionParam) : 1;
  if (!version || isNaN(version)) {
    return NextResponse.json({ error: "Nevažeća verzija." }, { status: 400 });
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

  const { data: docRecord } = await supabaseUser
    .from("contract_documents")
    .select("pdf_bucket, pdf_path")
    .eq("contract_id", contractId)
    .eq("version", version)
    .single();

  if (!docRecord) {
    return NextResponse.json({ error: "Dokument nije pronađen." }, { status: 404 });
  }

  const supabaseAdmin = getAdminClient();

  const { data: fileData, error: dlErr } = await supabaseAdmin.storage
    .from(docRecord.pdf_bucket)
    .download(docRecord.pdf_path);

  if (dlErr || !fileData) {
    console.debug("[download] Storage download failed:", dlErr);
    return NextResponse.json({ error: "Preuzimanje fajla nije uspjelo." }, { status: 500 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  supabaseUser.rpc("log_contract_download", {
    p_contract_id: contractId,
    p_version: version,
    p_ip: ip,
    p_user_agent: userAgent,
  }).then(({ error }) => {
    if (error) console.debug("[download] log_contract_download RPC error:", error);
  });

  const arrayBuffer = await fileData.arrayBuffer();

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ugovor-${contractId}-v${version}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
