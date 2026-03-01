"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../../context/ToastContext";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { sr } from "@/src/lib/strings/sr";
import { getProposalStatusLabel, getProposalPriceDisplay, normalizeProposalStatus } from "@/src/lib/proposals/compat";

type ProposalRow = {
  id: number;
  job_id: number;
  freelancer_id?: string;
  cover_letter: string | null;
  proposed_rate: number | null;
  proposed_fixed: number | null;
  status: string | null;
  rejection_reason: string | null;
  created_at: string;
  job_title?: string | null;
  freelancer_name?: string | null;
};

export default function FreelancerProposalsPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();

  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null);
  const [openingContractId, setOpeningContractId] = useState<number | null>(null);

  const canAccessFreelancerProposals = profile?.role === "freelancer" || profile?.active_role === "freelancer";
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/freelancer/proposals");
      return;
    }
    if (!authLoading && !canAccessFreelancerProposals) {
      router.replace("/");
      return;
    }
  }, [user, profile, authLoading, router, canAccessFreelancerProposals]);

  const loadProposals = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const uid = user.id;
    try {
      const { data, error } = await supabase
        .from("v_proposals")
        .select("*")
        .eq("freelancer_id", uid)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[freelancer/proposals] Supabase error:", error.code, error.message);
        setProposals([]);
        return;
      }

      const list = (data as unknown as ProposalRow[]) ?? [];
      setProposals(list);
    } catch (err) {
      console.error("[freelancer/proposals] fetch error:", err);
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const handleOpenContract = async (p: ProposalRow) => {
    if (!user || openingContractId) return;
    setOpeningContractId(p.id);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Sesija je istekla.");
      setOpeningContractId(null);
      return;
    }

    try {
      const res = await fetch(`/api/contracts/ensure?proposalId=${p.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json.error || "Greška pri otvaranju ugovora.");
        return;
      }

      const contractId = json.contract_id;
      if (contractId != null) {
        router.push(`/contracts/${contractId}`);
      } else {
        toast.error("Ugovor nije pronađen.");
      }
    } catch (err) {
      console.error("[freelancer/proposals] ensure error:", err);
      toast.error("Greška pri otvaranju ugovora.");
    } finally {
      setOpeningContractId(null);
    }
  };

  const handleWithdraw = async (proposalId: number) => {
    setWithdrawingId(proposalId);
    try {
      const { error } = await supabase
        .from("proposals")
        .update({ status: "withdrawn" })
        .eq("id", proposalId);

      if (error) {
        toast.error("Greška: " + error.message);
      } else {
        setProposals((prev) =>
          prev.map((p) => (p.id === proposalId ? { ...p, status: "withdrawn" } : p))
        );
        toast.success(sr.proposalWithdrawn);
      }
    } catch {
      toast.error("Greška pri povlačenju ponude.");
    } finally {
      setWithdrawingId(null);
    }
  };

  const getPrice = (p: ProposalRow) => getProposalPriceDisplay(p);

  const getStatusBadge = (s: string | null) => {
    const key = normalizeProposalStatus(s);
    const label = getProposalStatusLabel(s);
    if (key === "accepted") return <Badge variant="active">{label}</Badge>;
    if (key === "rejected" || key === "expired") return <Badge variant="cancelled">{label}</Badge>;
    if (key === "withdrawn") return <Badge variant="muted">{label}</Badge>;
    if (key === "shortlisted") return <Badge variant="accent">{label}</Badge>;
    return <Badge variant="accent">{label}</Badge>;
  };

  const getJobTitle = (p: ProposalRow) => (p.job_title && String(p.job_title).trim()) || "—";

  if (authLoading || !user || !canAccessFreelancerProposals) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>Moje ponude</h1>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      ) : proposals.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--muted)" }}>{sr.noProposals}</p>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: 14, fontSize: 13, fontWeight: 600 }}>Posao</th>
                  <th style={{ padding: 14, fontSize: 13, fontWeight: 600 }}>Status</th>
                  <th style={{ padding: 14, fontSize: 13, fontWeight: 600 }}>Ponuđena cijena</th>
                  <th style={{ padding: 14, fontSize: 13, fontWeight: 600 }}>Datum</th>
                  <th style={{ padding: 14, fontSize: 13, fontWeight: 600 }}>Akcije</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p: ProposalRow) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: 14 }}>
                      <Link href={`/jobs/${p.job_id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}>
                        {getJobTitle(p)}
                      </Link>
                    </td>
                    <td style={{ padding: 14 }}>
                      {getStatusBadge(p.status)}
                      {p.status === "rejected" && p.rejection_reason && (
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--danger)" }}>
                          {p.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td style={{ padding: 14, color: "var(--accent)", fontWeight: 500 }}>{getPrice(p)}</td>
                    <td style={{ padding: 14, color: "var(--muted)", fontSize: 14 }}>
                      {p.created_at ? new Date(p.created_at).toLocaleDateString("sr-Latn") : "—"}
                    </td>
                    <td style={{ padding: 14 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {p.status === "pending" && (
                          <Button
                            variant="secondary"
                            style={{ padding: "6px 12px", fontSize: 12 }}
                            onClick={() => handleWithdraw(p.id)}
                            disabled={withdrawingId === p.id}
                          >
                            {withdrawingId === p.id ? "..." : sr.withdraw}
                          </Button>
                        )}
                        {normalizeProposalStatus(p.status) === "accepted" && (
                          <Button
                            variant="primary"
                            style={{ padding: "6px 12px", fontSize: 12 }}
                            onClick={() => handleOpenContract(p)}
                            disabled={openingContractId === p.id}
                          >
                            {openingContractId === p.id ? "..." : sr.openContract}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
