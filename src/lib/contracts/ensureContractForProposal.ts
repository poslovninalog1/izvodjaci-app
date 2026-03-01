"use server";

import { createUserClient } from "@/src/lib/supabase/admin";

type Result = { ok: true; contractId: number } | { ok: false; error: string };

export async function ensureContractForProposalAction(
  proposalId: number,
  accessToken: string
): Promise<Result> {
  const supabase = createUserClient(accessToken);

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    if (process.env.NODE_ENV === "development") {
      console.log("[ensureContractForProposal] auth failed", { proposalId });
    }
    return { ok: false, error: "Niste prijavljeni." };
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[ensureContractForProposal] calling RPC", {
      proposalId,
      userId: user.id,
    });
  }

  const { data, error } = await supabase.rpc("ensure_contract_for_proposal", {
    p_proposal_id: proposalId,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.log("[ensureContractForProposal] RPC error", {
        proposalId,
        error: error.message,
      });
    }
    return { ok: false, error: error.message };
  }

  let contractId: number | null = null;
  if (typeof data === "number" && !isNaN(data)) contractId = data;
  else if (typeof data === "string" && /^\d+$/.test(data)) contractId = parseInt(data, 10);
  else if (data != null && typeof (data as { id?: number }).id === "number") contractId = (data as { id: number }).id;

  if (contractId == null) {
    if (process.env.NODE_ENV === "development") {
      console.log("[ensureContractForProposal] no contract id returned", { proposalId, data });
    }
    return { ok: false, error: "Ugovor nije kreiran." };
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[ensureContractForProposal] success", {
      proposalId,
      contractId,
      freelancerId: user.id,
    });
  }

  return { ok: true, contractId };
}
