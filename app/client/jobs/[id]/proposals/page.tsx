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
import { sr } from "@/src/lib/strings/sr";

type Proposal = {
  id: number;
  freelancer_id: string;
  job_id: number;
  cover_letter: string | null;
  proposed_rate: number | null;
  proposed_fixed: number | null;
  status: string | null;
  created_at: string;
  profiles: unknown;
};

type Job = {
  id: number;
  title: string | null;
  client_id: string | null;
};

export default function ClientProposalsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();
  const jobId = Number(params.id);

  const [job, setJob] = useState<Job | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

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
    async function load() {
      const { data: jobData, error: jobErr } = await supabase
        .from("jobs")
        .select("id, title, client_id")
        .eq("id", jobId)
        .single();

      if (jobErr || !jobData || (jobData as Job).client_id !== uid) {
        setJob(null);
        setProposals([]);
        setLoading(false);
        return;
      }
      setJob(jobData as Job);

      const { data: propData, error: propErr } = await supabase
        .from("proposals")
        .select("id, freelancer_id, job_id, cover_letter, proposed_rate, proposed_fixed, status, created_at, profiles(full_name)")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (propErr) setProposals([]);
      else setProposals((propData as unknown as Proposal[]) ?? []);
      setLoading(false);
    }
    load();
  }, [user?.id, jobId]);

  const updateStatus = async (proposalId: number, newStatus: string) => {
    const { error } = await supabase
      .from("proposals")
      .update({ status: newStatus })
      .eq("id", proposalId);

    if (error) toast.error("Greška: " + error.message);
    else {
      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: newStatus } : p))
      );
      toast.success(newStatus === "shortlisted" ? "U užem izboru." : "Odbijeno.");
    }
  };

  const handleHire = async (p: Proposal) => {
    if (!user) return;

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

    let conversationId: number;
    if (existingConv) {
      conversationId = (existingConv as { id: number }).id;
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({ contract_id: contractId })
        .select("id")
        .single();
      if (convErr || !newConv) {
        toast.error("Greška pri kreiranju razgovora.");
        return;
      }
      conversationId = (newConv as { id: number }).id;
    }

    await supabase
      .from("proposals")
      .update({ status: "hired" })
      .eq("id", p.id);

    setProposals((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, status: "hired" } : x))
    );

    toast.success("Izvođač angažovan!");
    router.push("/contracts/" + contractId);
  };

  const getPrice = (p: Proposal) => {
    if (p.proposed_fixed != null) return `${p.proposed_fixed} €`;
    if (p.proposed_rate != null) return `${p.proposed_rate} €/h`;
    return "—";
  };

  const getStatusBadge = (s: string | null) => {
    if (s === "hired") return <Badge variant="active">Angažovan</Badge>;
    if (s === "shortlisted") return <Badge variant="accent">U užem izboru</Badge>;
    if (s === "rejected") return <Badge variant="cancelled">Odbijeno</Badge>;
    return <Badge variant="muted">Poslato</Badge>;
  };

  const getProfileName = (p: Proposal) => {
    const prof = p.profiles;
    if (!prof) return "—";
    if (Array.isArray(prof)) return (prof[0] as { full_name?: string })?.full_name ?? "—";
    return (prof as { full_name?: string })?.full_name ?? "—";
  };

  if (authLoading || !user || profile?.role !== "client") {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p>Posao nije pronađen ili nemaš pristup.</p>
        <Link href="/client/jobs" style={{ color: "var(--accent)" }}>← {sr.backToClientJobs}</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Link href="/client/jobs" style={{ fontSize: 14, marginBottom: 16, display: "inline-block", color: "var(--accent)" }}>
        ← {sr.backToClientJobs}
      </Link>
      <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>Ponude: {job.title || "Bez naslova"}</h1>

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
                <div>
                  <strong>
                    <Link href={`/izvodjac/${p.freelancer_id}`} style={{ color: "inherit", textDecoration: "none" }}>
                      {getProfileName(p)}
                    </Link>
                  </strong>
                  <span style={{ marginLeft: 10 }}>{getStatusBadge(p.status)}</span>
                </div>
                <div style={{ fontSize: 14, color: "var(--accent)", fontWeight: 500 }}>
                  {getPrice(p)} • {p.created_at ? new Date(p.created_at).toLocaleDateString("sr-Latn") : "—"}
                </div>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5, color: "var(--muted)" }}>
                {(p.cover_letter || "").slice(0, 200)}
                {(p.cover_letter?.length ?? 0) > 200 ? "…" : ""}
              </p>
              {p.status === "submitted" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => updateStatus(p.id, "shortlisted")}>
                    Uži izbor
                  </Button>
                  <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => updateStatus(p.id, "rejected")}>
                    Odbij
                  </Button>
                  <Button variant="primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => handleHire(p)}>
                    Angažuj
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
