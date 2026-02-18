"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import { sr } from "@/src/lib/strings/sr";

type Proposal = {
  id: number;
  job_id: number;
  cover_letter: string | null;
  proposed_rate: number | null;
  proposed_fixed: number | null;
  status: string | null;
  created_at: string;
  jobs: unknown;
};

export default function FreelancerProposalsPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/freelancer/proposals");
      return;
    }
    if (!authLoading && profile?.role !== "freelancer") {
      router.replace("/");
      return;
    }
  }, [user, profile, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    async function load() {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, job_id, cover_letter, proposed_rate, proposed_fixed, status, created_at, jobs(title)")
        .eq("freelancer_id", uid)
        .order("created_at", { ascending: false });

      if (error) setProposals([]);
      else setProposals((data as unknown as Proposal[]) ?? []);
      setLoading(false);
    }
    load();
  }, [user?.id]);

  const getPrice = (p: Proposal) => {
    if (p.proposed_fixed != null) return `${p.proposed_fixed} €`;
    if (p.proposed_rate != null) return `${p.proposed_rate} €/h`;
    return "—";
  };

  const getStatusBadge = (s: string | null) => {
    if (s === "submitted") return <Badge variant="accent">Poslato</Badge>;
    if (s === "shortlisted") return <Badge variant="active">U užem izboru</Badge>;
    if (s === "rejected") return <Badge variant="cancelled">Odbijeno</Badge>;
    if (s === "hired") return <Badge variant="active">Angažovan</Badge>;
    return <Badge variant="muted">{s ?? "—"}</Badge>;
  };

  const getJobTitle = (p: Proposal) => {
    const j = p.jobs;
    if (!j) return "—";
    if (Array.isArray(j)) return (j[0] as { title?: string })?.title ?? "—";
    return (j as { title?: string })?.title ?? "—";
  };

  if (authLoading || !user || profile?.role !== "freelancer") {
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
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: 14 }}>
                      <Link href={`/jobs/${p.job_id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}>
                        {getJobTitle(p)}
                      </Link>
                    </td>
                    <td style={{ padding: 14 }}>{getStatusBadge(p.status)}</td>
                    <td style={{ padding: 14, color: "var(--accent)", fontWeight: 500 }}>{getPrice(p)}</td>
                    <td style={{ padding: 14, color: "var(--muted)", fontSize: 14 }}>
                      {p.created_at ? new Date(p.created_at).toLocaleDateString("sr-Latn") : "—"}
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
