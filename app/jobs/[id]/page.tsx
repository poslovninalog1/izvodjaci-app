"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import ProposalForm from "./ProposalForm";
import ReportModal from "../../components/ReportModal";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { sr } from "@/src/lib/strings/sr";

type Job = {
  id: number;
  title: string | null;
  description: string | null;
  city: string | null;
  budget_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  is_remote: boolean | null;
  skills: string[] | null;
  status: string | null;
  created_at: string;
  client_id: string | null;
  categories: unknown;
};

function getCategoryName(cat: unknown): string | null {
  if (!cat) return null;
  if (Array.isArray(cat)) return (cat[0] as { name?: string })?.name ?? null;
  return (cat as { name?: string })?.name ?? null;
}

export default function JobDetailPage() {
  const params = useParams();
  const { user, profile } = useAuth();
  const id = Number(params.id);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [proposalCount, setProposalCount] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!id || isNaN(id)) {
      setLoading(false);
      return;
    }
    async function load() {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, description, city, budget_type, budget_min, budget_max, is_remote, skills, status, created_at, client_id, categories(name)")
        .eq("id", id)
        .single();

      if (error || !data) {
        setJob(null);
      } else {
        setJob(data as unknown as Job);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  useEffect(() => {
    if (!id || !user || !job) return;
    if (job.client_id !== user.id) return;
    async function loadCount() {
      const { count } = await supabase
        .from("proposals")
        .select("id", { count: "exact", head: true })
        .eq("job_id", id);
      setProposalCount(count ?? 0);
    }
    loadCount();
  }, [id, user, job?.client_id]);

  const isOwner = user && job?.client_id === user.id;

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p>{sr.jobNotFound}</p>
        <Link href="/jobs">← {sr.backToJobs}</Link>
      </div>
    );
  }

  const posted = job.created_at ? new Date(job.created_at).toLocaleDateString("sr-Latn") : "";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, maxWidth: 1000, margin: "0 auto", alignItems: "start" }}>
      {/* Left: job detail */}
      <div>
        <Link href="/jobs" style={{ fontSize: 14, marginBottom: 16, display: "inline-block", color: "var(--accent)" }}>
          ← {sr.backToJobs}
        </Link>

        <Card style={{ marginBottom: 20 }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 600 }}>{job.title || "Bez naslova"}</h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, fontSize: 14, color: "var(--muted)" }}>
            {getCategoryName(job.categories) && <Badge variant="muted">{getCategoryName(job.categories)}</Badge>}
            {job.city && <span>{job.city}</span>}
            {job.is_remote && <Badge variant="accent">Remote</Badge>}
            {posted && <span>• Objavljeno {posted}</span>}
          </div>

          <div style={{ marginBottom: 20, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {job.description || "—"}
          </div>

          <div style={{ marginBottom: 20 }}>
            <strong>Budžet:</strong>{" "}
            {job.budget_type === "hourly"
              ? `${job.budget_min ?? "?"}–${job.budget_max ?? "?"} €/h`
              : `${job.budget_min ?? "?"}–${job.budget_max ?? "?"} €`}
          </div>

          {job.skills && job.skills.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <strong>Vještine:</strong>{" "}
              {job.skills.map((s, i) => (
                <Badge key={i} variant="muted" style={{ marginRight: 6 }}>{s}</Badge>
              ))}
            </div>
          )}

          {user && (
            <p style={{ marginTop: 20 }}>
              <Button variant="secondary" onClick={() => setShowReport(true)} style={{ padding: "6px 12px", fontSize: 12 }}>
                {sr.report}
              </Button>
            </p>
          )}
        </Card>
      </div>

      {/* Right: sticky action card */}
      <div style={{ position: "sticky", top: 80 }}>
        <Card>
          {isOwner && job.status === "open" && (
            <Link href={`/client/jobs/${job.id}/proposals`} style={{ display: "block", marginBottom: 8 }}>
              <Button variant="primary" style={{ width: "100%" }}>
                Ponude {proposalCount != null ? `(${proposalCount})` : ""}
              </Button>
            </Link>
          )}

          {job.status === "open" && (
            <>
              <ProposalForm jobId={job.id} budgetType={job.budget_type} />
              {!user && (
                <p style={{ marginTop: 16, fontSize: 14, color: "var(--muted)" }}>
                  <Link href={`/login?next=/jobs/${job.id}`} style={{ color: "var(--accent)" }}>Prijavi se</Link> kao izvođač da pošalješ ponudu.
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {showReport && (
        <ReportModal
          targetType="job"
          targetId={String(job.id)}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
