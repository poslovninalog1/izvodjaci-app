"use server";

import { headers } from "next/headers";
import { getAdminClient, hasServiceKey, createUserClient } from "@/src/lib/supabase/admin";
import { generateContractPdf, type ContractPdfData } from "./generateContractPdf";
import { sha256Hex } from "./sha256";

const TOS_VERSION = "1.0";
const TOS_TEXT =
  "Korišćenjem platforme Izvođači pristajete na uslove korišćenja. " +
  "Elektronsko prihvatanje ugovora klikom na dugme ima istu pravnu snagu " +
  "kao i svojeručni potpis u skladu sa zakonom o elektronskom potpisu.";

type AcceptResult =
  | { ok: true; version: number; pdfPath: string }
  | { ok: false; error: string };

export async function acceptContractAction(
  contractId: number,
  accessToken: string
): Promise<AcceptResult> {
  if (!hasServiceKey()) {
    return { ok: false, error: "Server konfiguracija nije kompletna (fali SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const supabaseAdmin = getAdminClient();
  const supabaseUser = createUserClient(accessToken);

  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) {
    return { ok: false, error: "Niste prijavljeni." };
  }

  const { data: contract, error: cErr } = await supabaseUser
    .from("contracts")
    .select("id, job_id, client_id, freelancer_id, status, started_at")
    .eq("id", contractId)
    .single();

  if (cErr || !contract) {
    return { ok: false, error: "Ugovor nije pronađen ili nemate pristup." };
  }

  if (contract.client_id !== user.id && contract.freelancer_id !== user.id) {
    return { ok: false, error: "Nemate pristup ovom ugovoru." };
  }

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .in("id", [contract.client_id, contract.freelancer_id]);

  const profileMap: Record<string, string> = {};
  (profiles ?? []).forEach((p: { id: string; full_name: string | null }) => {
    profileMap[p.id] = p.full_name ?? "—";
  });

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("title, description, budget_type, budget_min, budget_max")
    .eq("id", contract.job_id)
    .single();

  // Determine next version
  const { data: existingDocs } = await supabaseAdmin
    .from("contract_documents")
    .select("version")
    .eq("contract_id", contractId)
    .order("version", { ascending: false })
    .limit(1);

  const maxVersion = existingDocs && existingDocs.length > 0 ? existingDocs[0].version : 0;

  if (maxVersion > 0) {
    return { ok: false, error: "Ugovor je već prihvaćen." };
  }

  const version = maxVersion + 1;

  const now = new Date().toISOString();
  const startedAt = contract.started_at != null ? String(contract.started_at) : now;
  const pdfData: ContractPdfData = {
    contractId,
    clientName: (profileMap[contract.client_id] ?? "").trim() || "—",
    freelancerName: (profileMap[contract.freelancer_id] ?? "").trim() || "—",
    jobTitle: (job?.title ?? "").trim() || "—",
    jobDescription: (job?.description ?? "").trim() || "",
    budgetType: job?.budget_type ?? null,
    budgetMin: job?.budget_min != null ? Number(job.budget_min) : null,
    budgetMax: job?.budget_max != null ? Number(job.budget_max) : null,
    startedAt,
    acceptedAt: now,
    tosVersion: TOS_VERSION,
  };

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateContractPdf(pdfData);
  } catch (e) {
    console.error("[acceptContract] PDF generation failed:", e);
    return { ok: false, error: "Generisanje PDF-a nije uspjelo." };
  }

  const pdfBuffer = Buffer.from(pdfBytes);
  const pdfSha256 = sha256Hex(pdfBuffer);
  const pdfPath = `contract/${contractId}/v${version}.pdf`;
  const bucket = "contracts";

  // Ensure bucket exists (idempotent)
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const bucketExists = (buckets ?? []).some((b: { name: string }) => b.name === bucket);
  if (!bucketExists) {
    const { error: bErr } = await supabaseAdmin.storage.createBucket(bucket, {
      public: false,
    });
    if (bErr) {
      console.debug("[acceptContract] Bucket creation failed:", bErr);
      return { ok: false, error: "Kreiranje storage bucket-a nije uspjelo." };
    }
  }

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(bucket)
    .upload(pdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    console.debug("[acceptContract] Upload failed:", uploadErr);
    return { ok: false, error: "Upload PDF-a nije uspio." };
  }

  const hdrs = await headers();
  const ipRaw =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    null;
  const p_ip: string | null = ipRaw && String(ipRaw).trim() ? String(ipRaw).trim() : null;
  const userAgent = (hdrs.get("user-agent") ?? "") || "unknown";
  const tosSha256 = sha256Hex(Buffer.from(TOS_TEXT, "utf-8"));

  const rpcPayload = {
    p_contract_id: contractId,
    p_version: version,
    p_pdf_bucket: bucket,
    p_pdf_path: pdfPath,
    p_pdf_sha256: pdfSha256,
    p_ip,
    p_user_agent: userAgent,
    p_tos_version: TOS_VERSION,
    p_tos_sha256: tosSha256,
  };

  const { error: rpcErr } = await supabaseUser.rpc("accept_contract_with_document", rpcPayload);

  if (rpcErr) {
    console.error("[acceptContract] RPC accept_contract_with_document failed:", {
      error_code: rpcErr.code,
      error_message: rpcErr.message,
      error_details: rpcErr.details,
      payload: {
        ...rpcPayload,
        p_pdf_sha256: rpcPayload.p_pdf_sha256 ? `${rpcPayload.p_pdf_sha256.slice(0, 16)}...` : null,
      },
    });
    await supabaseAdmin.storage.from(bucket).remove([pdfPath]);
    return { ok: false, error: rpcErr.message || "Prihvatanje ugovora nije uspjelo." };
  }

  return { ok: true, version, pdfPath };
}
