"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../../context/ToastContext";
import { acceptContractAction } from "@/src/lib/contracts/acceptContract";
import ReviewForm from "./ReviewForm";
import ContractPdfPanel from "./ContractPdfPanel";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { sr } from "@/src/lib/strings/sr";

type Contract = {
  id: number;
  job_id: string;
  client_id: string;
  freelancer_id: string;
  status: string | null;
  started_at: string;
  completed_at: string | null;
  jobs: unknown;
};

type ContractDocument = {
  version: number;
  uploaded_at: string;
};

type AuditEntry = {
  id: number;
  action_type: string;
  performed_by: string | null;
  ip_address: string | null;
  metadata: (Record<string, unknown> & { pdf_bucket?: string; pdf_path?: string }) | null;
  occurred_at: string;
};

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();
  const rawId = params.id as string;
  const contractId = /^\d+$/.test(String(rawId)) ? parseInt(rawId, 10) : NaN;
  const isInvalidId = !rawId || isNaN(contractId);

  const [contract, setContract] = useState<Contract | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [clientName, setClientName] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [loading, setLoading] = useState(true);

  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [tosChecked, setTosChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [downloadingVersion, setDownloadingVersion] = useState<number | null>(null);
  const [loadingSignedPdfId, setLoadingSignedPdfId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/contracts/" + encodeURIComponent(rawId));
      return;
    }
  }, [user, authLoading, router, rawId]);

  const loadEvidenceData = useCallback(async (cid: number) => {
    if (!cid) return;
    const [docsRes, auditRes] = await Promise.all([
      supabase
        .from("contract_documents")
        .select("version, uploaded_at")
        .eq("contract_id", cid)
        .order("version", { ascending: false }),
      supabase
        .from("contract_audit_log")
        .select("id, action_type, performed_by, ip_address, metadata, occurred_at")
        .eq("contract_id", cid)
        .order("occurred_at", { ascending: false }),
    ]);

    if (docsRes.data) setDocuments(docsRes.data);
    if (auditRes.data) {
      setAuditLog(auditRes.data);
      const performerIds = [
        ...new Set(
          auditRes.data
            .map((e: AuditEntry) => e.performed_by)
            .filter((id): id is string => id != null)
        ),
      ];
      if (performerIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", performerIds);
        const map: Record<string, string> = { ...profileNames };
        (profs ?? []).forEach((p: { id: string; full_name: string | null }) => {
          map[p.id] = p.full_name ?? "—";
        });
        setProfileNames(map);
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (isInvalidId) {
      setContract(null);
      setLoading(false);
      return;
    }
    const uid = user.id;
    async function load() {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, job_id, client_id, freelancer_id, status, started_at, completed_at, jobs(title)")
        .eq("id", contractId)
        .single();

      if (error || !data) {
        if (error) {
          console.error("[contracts/[id]] Supabase error:", error.code, error.message);
        }
        setContract(null);
        setLoading(false);
        return;
      }

      const c = data as unknown as Contract;
      if (c.client_id !== uid && c.freelancer_id !== uid) {
        console.error("[contracts/[id]] User not a party:", { contractId, userId: uid });
        setContract(null);
        setLoading(false);
        return;
      }

      setContract(c);

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", [c.client_id, c.freelancer_id]);
      const nameMap: Record<string, string> = {};
      (profs ?? []).forEach((p: { id: string; full_name: string | null }) => {
        if (p.id === c.client_id) setClientName(p.full_name ?? "—");
        if (p.id === c.freelancer_id) setFreelancerName(p.full_name ?? "—");
        nameMap[p.id] = p.full_name ?? "—";
      });
      setProfileNames(nameMap);

      const { data: convData } = await supabase
        .from("conversations")
        .select("id")
        .eq("contract_id", c.id)
        .maybeSingle();
      setConversationId((convData as { id: number } | null)?.id ?? null);

      loadEvidenceData(c.id);
      setLoading(false);
    }
    load();
  }, [user?.id, rawId, isInvalidId, contractId, loadEvidenceData]);

  const handleAccept = async () => {
    if (!user || !tosChecked) return;
    setAccepting(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Sesija je istekla, prijavite se ponovo.");
      setAccepting(false);
      return;
    }

    const result = await acceptContractAction(contractId, session.access_token);

    setAccepting(false);
    setShowAcceptModal(false);
    setTosChecked(false);

    if (result.ok) {
      toast.success(sr.contractAccepted);
      if (contract) loadEvidenceData(contract.id);
    } else {
      toast.error(result.error);
    }
  };

  const handleDownload = async (version: number) => {
    setDownloadingVersion(version);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Sesija je istekla.");
        return;
      }

      const res = await fetch(`/api/contracts/${contractId}/download?version=${version}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Preuzimanje nije uspjelo.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ugovor-${contractId}-v${version}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Preuzimanje nije uspjelo.");
    } finally {
      setDownloadingVersion(null);
    }
  };

  const handleComplete = async () => {
    if (!contract || !user || contract.client_id !== user.id) return;
    const { error } = await supabase
      .from("contracts")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", contract.id);

    if (error) toast.error("Greška: " + error.message);
    else {
      setContract({ ...contract, status: "completed", completed_at: new Date().toISOString() });
      toast.success("Ugovor je označen kao završen.");
    }
  };

  const getJobTitle = (c: Contract) => {
    const j = c.jobs;
    if (!j) return "—";
    if (Array.isArray(j)) return (j[0] as { title?: string })?.title ?? "—";
    return (j as { title?: string })?.title ?? "—";
  };

  const getStatusBadge = (s: string | null) => {
    if (s === "active") return <Badge variant="active">Aktivan</Badge>;
    if (s === "completed") return <Badge variant="completed">Završen</Badge>;
    if (s === "cancelled") return <Badge variant="cancelled">Otkazan</Badge>;
    return <Badge variant="muted">{s ?? "—"}</Badge>;
  };

  const formatAuditAction = (action: string) => {
    const map: Record<string, string> = {
      contract_accepted: "Ugovor prihvaćen",
      accept_with_document: "Ugovor prihvaćen (PDF)",
      pdf_downloaded: "PDF preuzet",
    };
    return map[action] ?? action;
  };

  const getPdfFromEntry = (entry: AuditEntry): { bucket: string; path: string } | null => {
    const meta = entry.metadata;
    if (!meta) return null;
    const path = typeof meta.pdf_path === "string" ? meta.pdf_path.trim() : null;
    if (!path) return null;
    const bucket = typeof meta.pdf_bucket === "string" && meta.pdf_bucket.trim()
      ? meta.pdf_bucket.trim()
      : "contracts";
    return { bucket, path };
  };

  const handleOpenAuditPdf = async (entry: AuditEntry) => {
    const pdf = getPdfFromEntry(entry);
    if (!pdf || !contractId) return;
    setLoadingSignedPdfId(entry.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast?.error?.("Sesija je istekla.");
        return;
      }
      const res = await fetch(
        `/api/contracts/${contractId}/signed-pdf?bucket=${encodeURIComponent(pdf.bucket)}&path=${encodeURIComponent(pdf.path)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast?.error?.(json.error ?? "Preuzimanje nije uspjelo.");
        return;
      }
      if (json.url) window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[contracts] signed-pdf error:", err);
      toast?.error?.("Greška pri otvaranju PDF-a.");
    } finally {
      setLoadingSignedPdfId(null);
    }
  };

  if (authLoading || !user) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  if (isInvalidId) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--danger)" }}>Nevažeći ID ugovora. Koristite broj (contract.id).</p>
        <Link href="/contracts" style={{ color: "var(--accent)" }}>← {sr.backToContracts}</Link>
      </div>
    );
  }

  if (!contract) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p>{sr.contractNotFound}</p>
        <Link href="/contracts" style={{ color: "var(--accent)" }}>← {sr.backToContracts}</Link>
      </div>
    );
  }

  const hasDocument = documents.length > 0;
  const isParty = user.id === contract.client_id || user.id === contract.freelancer_id;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/contracts" style={{ fontSize: 14, marginBottom: 16, display: "inline-block", color: "var(--accent)" }}>
        ← {sr.backToContracts}
      </Link>

      <Card>
        <h1 style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 600 }}>Ugovor: {getJobTitle(contract)}</h1>
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: "0 0 8px" }}><strong>Status:</strong> {getStatusBadge(contract.status)}</p>
          <p style={{ margin: "0 0 8px" }}><strong>Klijent:</strong> {clientName}</p>
          <p style={{ margin: "0 0 8px" }}><strong>Izvođač:</strong> {freelancerName}</p>
          <p style={{ margin: "0 0 8px" }}><strong>Započet:</strong> {contract.started_at ? new Date(contract.started_at).toLocaleDateString("sr-Latn") : "—"}</p>
          {contract.completed_at && (
            <p style={{ margin: 0 }}><strong>Završen:</strong> {new Date(contract.completed_at).toLocaleDateString("sr-Latn")}</p>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {conversationId && (
            <Link href={`/inbox/${conversationId}`}>
              <Button variant="primary">Otvori razgovor</Button>
            </Link>
          )}
          {profile?.role === "client" && contract.status === "active" && (
            <Button variant="secondary" onClick={handleComplete}>
              Označi kao završeno
            </Button>
          )}
          {isParty && contract.status === "active" && !hasDocument && (
            <Button variant="primary" onClick={() => setShowAcceptModal(true)}>
              {sr.acceptContract}
            </Button>
          )}
        </div>
      </Card>

      {/* ── Documents / Download ── */}
      {hasDocument && (
        <Card style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Dokumenti ugovora</h3>
          {documents.map((doc) => (
            <div
              key={doc.version}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 14 }}>
                Verzija {doc.version} — {new Date(doc.uploaded_at).toLocaleString("sr-Latn")}
              </span>
              <Button
                variant="secondary"
                style={{ fontSize: 13, padding: "4px 12px" }}
                onClick={() => handleDownload(doc.version)}
                disabled={downloadingVersion === doc.version}
              >
                {downloadingVersion === doc.version ? sr.downloading : sr.downloadPdf}
              </Button>
            </div>
          ))}
        </Card>
      )}

      {/* ── Audit Log ── */}
      {isParty && (
        <Card style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>{sr.auditLogTitle}</h3>
          {auditLog.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{sr.noAuditEvents}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {auditLog.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    padding: "8px 12px",
                    background: "var(--panel2, #f9fafb)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
                    <strong>{formatAuditAction(entry.action_type)}</strong>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>
                      {new Date(entry.occurred_at).toLocaleString("sr-Latn")}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, color: "var(--muted)" }}>
                    {entry.performed_by && (
                      <span>Korisnik: {profileNames[entry.performed_by] ?? entry.performed_by}</span>
                    )}
                    {entry.ip_address && (
                      <span style={{ marginLeft: 12 }}>IP: {entry.ip_address}</span>
                    )}
                  </div>
                  {(entry.action_type === "contract_accepted" || entry.action_type === "accept_with_document") && getPdfFromEntry(entry) && (
                    <div style={{ marginTop: 8 }}>
                      <Button
                        variant="secondary"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => handleOpenAuditPdf(entry)}
                        disabled={loadingSignedPdfId === entry.id}
                      >
                        {loadingSignedPdfId === entry.id ? "..." : "Preuzmi PDF"}
                      </Button>
                    </div>
                  )}
                  {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>
                        Detalji
                      </summary>
                      <pre style={{ margin: "4px 0 0", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Ugovor (PDF): embed + download via client panel (directly below Istorija događaja) ── */}
      <ContractPdfPanel contractId={contract.id} />

      {/* ── Accept Modal ── */}
      {showAcceptModal && (
        <Modal title={sr.acceptContractTitle} onClose={() => { setShowAcceptModal(false); setTosChecked(false); }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" }}>
              Prihvatate ugovor za posao <strong>{getJobTitle(contract)}</strong> sa:
            </p>
            <ul style={{ fontSize: 14, margin: "0 0 12px", paddingLeft: 20 }}>
              <li><strong>Klijent:</strong> {clientName}</li>
              <li><strong>Izvođač:</strong> {freelancerName}</li>
            </ul>
          </div>

          <div
            style={{
              background: "var(--panel2, #f9fafb)",
              borderRadius: "var(--radius-sm)",
              padding: 12,
              marginBottom: 16,
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--muted)",
              maxHeight: 120,
              overflowY: "auto",
            }}
          >
            {sr.tosText}
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              marginBottom: 20,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={tosChecked}
              onChange={(e) => setTosChecked(e.target.checked)}
              style={{ marginTop: 3, accentColor: "var(--accent)" }}
            />
            <span>{sr.tosCheckboxLabel}</span>
          </label>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <Button
              variant="secondary"
              onClick={() => { setShowAcceptModal(false); setTosChecked(false); }}
              disabled={accepting}
            >
              {sr.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={handleAccept}
              disabled={!tosChecked || accepting}
            >
              {accepting ? sr.accepting : sr.confirmAccept}
            </Button>
          </div>
        </Modal>
      )}

      {contract.status === "completed" && (
        <ReviewForm
          contractId={contract.id}
          clientId={contract.client_id}
          freelancerId={contract.freelancer_id}
          revieweeName={user.id === contract.client_id ? freelancerName : clientName}
        />
      )}
    </div>
  );
}
