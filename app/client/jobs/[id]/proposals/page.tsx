"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../../../../context/ToastContext";
import Card from "../../../../components/ui/Card";
import Badge from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import Textarea from "../../../../components/ui/Textarea";
import { sr } from "@/src/lib/strings/sr";

type ProposalRow = {
  id: number;
  freelancer_id: string;
  job_id: number;
  cover_letter: string | null;
  proposed_rate: number | null;
  proposed_fixed: number | null;
  status: string | null;
  rejection_reason: string | null;
  created_at: string;
  job_title?: string | null;
  freelancer_name?: string | null;
};

type Job = {
  id: number;
  title: string | null;
  client_id: string | null;
  status: string | null;
  decision_deadline?: string | null;
};

function getDeadlineInfo(deadline: string | null): { text: string; expired: boolean } | null {
  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { text: sr.deadlineExpired, expired: true };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const text = days > 0 ? `${days}d ${hours}h ${sr.deadlineRemaining}` : `${hours}h ${sr.deadlineRemaining}`;
  return { text, expired: false };
}

export default function ClientProposalsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/client/jobs/" + jobId + "/proposals");
      return;
    }
    if (!authLoading && profile?.role !== "client") {
      router.replace("/");
      return;
    }
  }, [user, profile, authLoading, router, jobId]);

  useEffect(() => {
    if (!user || !jobId) return;
    const uid = user.id;
    let cancelled = false;

    async function load() {
      try {
        const { data: jobData, error: jobErr } = await supabase
          .from("jobs")
          .select("id, title, client_id, status, decision_deadline")
          .eq("id", jobId)
          .single();

        if (cancelled) return;
        if (jobErr || !jobData || (jobData as Job).client_id !== uid) {
          setJob(null);
          setProposals([]);
          return;
        }
        setJob(jobData as Job);

        const { data: propData, error: propErr } = await supabase
          .from("v_proposals")
          .select("*")
          .eq("job_id", jobId)
          .order("created_at", { ascending: false });

        if (cancelled) return;
        if (propErr) {
          if (process.env.NODE_ENV === "development") console.debug("[client/proposals] v_proposals fetch error:", propErr.message);
          setProposals([]);
        } else {
          if (process.env.NODE_ENV === "development") console.debug("[client/proposals] v_proposals fetch", { count: propData?.length ?? 0 });
          setProposals((propData as unknown as ProposalRow[]) ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[client/proposals] fetch error:", err);
          setJob(null);
          setProposals([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id, jobId]);

  const handleAccept = async (p: ProposalRow) => {
    if (!user || actionLoading) return;
    setActionLoading(true);

    try {
      const { data: existingContract } = await supabase
        .from("contracts")
        .select("id")
        .eq("job_id", p.job_id)
        .eq("status", "active")
        .maybeSingle();

      if (existingContract) {
        toast.error("Već postoji aktivan ugovor za ovaj posao.");
        return;
      }

      const { data: newContract, error: contractErr } = await supabase
        .from("contracts")
        .insert({
          job_id: p.job_id,
          client_id: user.id,
          freelancer_id: p.freelancer_id,
          status: "active",
        })
        .select("id")
        .single();

      if (contractErr || !newContract) {
        toast.error("Greška pri kreiranju ugovora.");
        return;
      }

      const contractId = (newContract as { id: number }).id;

      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("contract_id", contractId)
        .maybeSingle();

      if (!existingConv) {
        await supabase.from("conversations").insert({ contract_id: contractId });
      }

      await supabase
        .from("proposals")
        .update({ status: "accepted" })
        .eq("id", p.id);

      // Auto-reject other pending proposals
      await supabase
        .from("proposals")
        .update({ status: "rejected", rejection_reason: sr.otherFreelancerChosen })
        .eq("job_id", p.job_id)
        .eq("status", "pending")
        .neq("id", p.id);

      // Close the job
      await supabase
        .from("jobs")
        .update({ status: "closed" })
        .eq("id", p.job_id);

      setProposals((prev) =>
        prev.map((x) => {
          if (x.id === p.id) return { ...x, status: "accepted" };
          if (x.status === "pending") return { ...x, status: "rejected", rejection_reason: sr.otherFreelancerChosen };
          return x;
        })
      );
      setJob((prev) => prev ? { ...prev, status: "closed" } : prev);

      toast.success(sr.proposalAccepted);
      router.push("/contracts/" + contractId);
    } catch (err) {
      console.error("[client/proposals] accept error:", err);
      toast.error("Greška pri prihvatanju ponude.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (proposalId: number) => {
    if (actionLoading) return;
    const reason = rejectionReason.trim();
    if (!reason) {
      toast.error(sr.rejectionReasonRequired);
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("proposals")
        .update({ status: "rejected", rejection_reason: reason })
        .eq("id", proposalId);

      if (error) {
        toast.error("Greška: " + error.message);
      } else {
        setProposals((prev) =>
          prev.map((p) => (p.id === proposalId ? { ...p, status: "rejected", rejection_reason: reason } : p))
        );
        toast.success(sr.proposalRejected);
        setRejectingId(null);
        setRejectionReason("");
      }
    } catch (err) {
      console.error("[client/proposals] reject error:", err);
      toast.error("Greška pri odbijanju ponude.");
    } finally {
      setActionLoading(false);
    }
  };

  const getPrice = (p: Proposal) => {
    if (p.proposed_fixed != null) return `${p.proposed_fixed} €`;
    if (p.proposed_rate != null) return `${p.proposed_rate} €/h`;
    return "—";
  };

  const getStatusBadge = (s: string | null) => {
    if (s === "accepted") return <Badge variant="active">{sr.statusAccepted}</Badge>;
    if (s === "rejected") return <Badge variant="cancelled">{sr.statusRejected}</Badge>;
    if (s === "withdrawn") return <Badge variant="muted">{sr.statusWithdrawn}</Badge>;
    if (s === "expired") return <Badge variant="cancelled">{sr.statusExpired}</Badge>;
    return <Badge variant="accent">{sr.statusPending}</Badge>;
  };

  const getDisplayName = (p: ProposalRow) =>
    (p.freelancer_name && String(p.freelancer_name).trim()) || "—";

  const getInitial = (name: string) =>
    name && name !== "—" ? name.trim().charAt(0).toUpperCase() : "?";

  if (authLoading || !user || profile?.role !== "client") {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  if (!loading && !job) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p>Posao nije pronađen ili nemaš pristup.</p>
        <Link href="/client/jobs" style={{ color: "var(--accent)" }}>← {sr.backToClientJobs}</Link>
      </div>
    );
  }

  const deadlineInfo = job ? getDeadlineInfo(job.decision_deadline) : null;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Link href="/client/jobs" style={{ fontSize: 14, marginBottom: 16, display: "inline-block", color: "var(--accent)" }}>
        ← {sr.backToClientJobs}
      </Link>
      <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 600 }}>Ponude: {job?.title || "Bez naslova"}</h1>

      {deadlineInfo && (
        <p style={{ margin: "0 0 20px", fontSize: 14, color: deadlineInfo.expired ? "var(--danger)" : "var(--accent)", fontWeight: 500 }}>
          {sr.decisionDeadline}: {deadlineInfo.text}
        </p>
      )}

      {loading ? (
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      ) : proposals.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--muted)" }}>{sr.noProposalsForJob}</p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {proposals.map((p) => (
            <Card key={p.id} style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "var(--panel2)",
                      border: "1px solid var(--border)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--muted)",
                    }}
                  >
                    {getInitial(getDisplayName(p))}
                  </span>
                  <strong>
                    <Link href={`/izvodjac/${p.freelancer_id}`} style={{ color: "inherit", textDecoration: "none" }}>
                      {getDisplayName(p)}
                    </Link>
                  </strong>
                  <span style={{ marginLeft: 10 }}>{getStatusBadge(p.status)}</span>
                </div>
                <div style={{ fontSize: 14, color: "var(--accent)", fontWeight: 500 }}>
                  {getPrice(p)} • {p.created_at ? new Date(p.created_at).toLocaleDateString("sr-Latn") : "—"}
                </div>
              </div>

              <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5, color: "var(--muted)" }}>
                {(p.cover_letter || "").slice(0, 300)}
                {(p.cover_letter?.length ?? 0) > 300 ? "…" : ""}
              </p>

              {p.status === "rejected" && p.rejection_reason && (
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--danger)" }}>
                  <strong>{sr.rejectionReason}:</strong> {p.rejection_reason}
                </p>
              )}

              {p.status === "pending" && (
                <div>
                  {rejectingId === p.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <Textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Razlog odbijanja..."
                        rows={2}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button
                          variant="primary"
                          style={{ padding: "6px 12px", fontSize: 12 }}
                          onClick={() => handleReject(p.id)}
                          disabled={actionLoading}
                        >
                          {actionLoading ? "..." : sr.confirmReject}
                        </Button>
                        <Button
                          variant="secondary"
                          style={{ padding: "6px 12px", fontSize: 12 }}
                          onClick={() => { setRejectingId(null); setRejectionReason(""); }}
                          disabled={actionLoading}
                        >
                          {sr.cancel}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        variant="secondary"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                        onClick={() => setRejectingId(p.id)}
                        disabled={actionLoading}
                      >
                        {sr.reject}
                      </Button>
                      <Button
                        variant="primary"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                        onClick={() => handleAccept(p)}
                        disabled={actionLoading}
                      >
                        {sr.accept}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
