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
  id: string | number;
  title: string | null;
  description: string | null;
  city: string | null;
  budget_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  is_remote: boolean | null;
  skills: string[] | null;
  created_at: string;
  client_id: string | null;
  category_id: number | null;
};

export default function JobDetailPage() {
  const params = useParams();
  const { user, profile } = useAuth();
  const idParam = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const [job, setJob] = useState<Job | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [proposalCount, setProposalCount] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!idParam) {
      setLoading(false);
      setJob(null);
      return;
    }
    async function load() {
      if (process.env.NODE_ENV === "development") {
        console.log("[job-detail] param id", idParam, "type", typeof idParam);
      }
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, description, city, category_id, client_id, budget_min, budget_max, budget_type, is_remote, skills, created_at")
        .eq("id", idParam)
        .single();

      if (process.env.NODE_ENV === "development" && error) {
        console.log("[job-detail] error", error.message, error.code, error.details);
      }
      if (error || !data) {
        if (error) console.error("[job detail] Supabase error:", error.message, error.code);
        setJob(null);
      } else {
        setJob(data as Job);
        if (data.category_id) {
          const { data: cat } = await supabase
            .from("categories")
            .select("name")
            .eq("id", data.category_id)
            .single();
          setCategoryName(cat?.name ?? null);
        }
      }
      setLoading(false);
    }
    load();
  }, [idParam]);

  useEffect(() => {
    if (!idParam || !user || !job) return;
    if (job.client_id !== user.id) return;
    async function loadCount() {
      const { count } = await supabase
        .from("proposals")
        .select("id", { count: "exact", head: true })
        .eq("job_id", id);
      setProposalCount(count ?? 0);
    }
    loadCount();
  }, [idParam, user, job?.client_id]);

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
            {categoryName && <Badge variant="muted">{categoryName}</Badge>}
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
          {isOwner && (
            <Link href={`/client/jobs/${job.id}/proposals`} style={{ display: "block", marginBottom: 8 }}>
              <Button variant="primary" style={{ width: "100%" }}>
                Ponude {proposalCount != null ? `(${proposalCount})` : ""}
              </Button>
            </Link>
          )}

          {(
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
