import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/src/lib/supabase/admin";

/**
 * GET /api/contracts/ensure?proposalId=123
 * Calls RPC ensure_contract_for_proposal(proposalId) and returns contract_id.
 * Requires Bearer token. User must be party to the proposal (freelancer or client).
 */
export async function GET(req: NextRequest) {
  const proposalIdParam = req.nextUrl.searchParams.get("proposalId");
  const proposalId = proposalIdParam && /^\d+$/.test(proposalIdParam)
    ? parseInt(proposalIdParam, 10)
    : NaN;

  if (!proposalIdParam || isNaN(proposalId)) {
    return NextResponse.json(
      { error: "Nevažeći proposalId. Očekuje se broj." },
      { status: 400 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  const supabase = createUserClient(authHeader.replace(/^Bearer\s+/i, ""));

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("ensure_contract_for_proposal", {
    p_proposal_id: proposalId,
  });

  if (error) {
    console.error("[api/contracts/ensure] RPC error:", error.code, error.message);
    return NextResponse.json(
      { error: error.message || "Greška pri kreiranju ugovora." },
      { status: 500 }
    );
  }

  let contractId: number | null = null;
  if (typeof data === "number" && !isNaN(data)) contractId = data;
  else if (typeof data === "string" && /^\d+$/.test(data)) contractId = parseInt(data, 10);
  else if (data != null && typeof (data as { id?: number }).id === "number") {
    contractId = (data as { id: number }).id;
  }

  if (contractId == null) {
    return NextResponse.json(
      { error: "Ugovor nije kreiran." },
      { status: 500 }
    );
  }

  return NextResponse.json({ contract_id: contractId });
}
