"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
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
  created_at: string;
  client_id: string | null;
  category_id: number | null;
  // status exists since migration 00002 — safe to select
  status: string | null;
  // decision_deadline only exists after migration 00013 — NOT selected here
};

const DEV = process.env.NODE_ENV === "development";

export default function JobDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, profile } = useAuth();
  const idParam = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";
  const proposalFormRef = useRef<HTMLDivElement>(null);

  const [job, setJob] = useState<Job | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [proposalCount, setProposalCount] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);

  const actionProposal = searchParams.get("action") === "proposal";
  if (DEV) console.debug("[job-detail] action param:", searchParams.get("action"), "actionProposal:", actionProposal);

  useEffect(() => {
    if (actionProposal && !user) {
      const next = `/jobs/${idParam}?action=proposal`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
  }, [actionProposal, user, idParam, router]);

  const handleProposalFormMounted = useCallback(() => {
    if (!actionProposal) return;
    const el = proposalFormRef.current;
    if (!el) {
      if (DEV) console.debug("[job-detail] ProposalForm onMounted but ref is null");
      return;
    }
    if (DEV) console.debug("[job-detail] ProposalForm mounted, scrolling and focusing");
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstField = el.querySelector<HTMLTextAreaElement | HTMLInputElement>("[data-proposal-first-field]");
    if (firstField) {
      requestAnimationFrame(() => {
        firstField.focus();
        if (DEV) console.debug("[job-detail] proposal form focus succeeded:", document.activeElement === firstField);
      });
    } else if (DEV) console.debug("[job-detail] proposal form mounted but no [data-proposal-first-field] found");
  }, [actionProposal]);

  useEffect(() => {
    if (!actionProposal || !job) return;
    const el = proposalFormRef.current;
    if (el) {
      const first = el.querySelector("[data-proposal-first-field]");
      if (first) handleProposalFormMounted();
    }
  }, [actionProposal, job, handleProposalFormMounted]);

  useEffect(() => {
    if (!idParam) {
      setLoading(false);
      setJob(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    async function load() {
      try {
        if (DEV) console.log("[job-detail] fetching id:", idParam);

        const { data, error } = await supabase
          .from("jobs")
          // NOTE: decision_deadline intentionally omitted — column added in migration 00013.
          // Add it back here after applying that migration to the database.
          .select("id, title, description, city, category_id, client_id, budget_min, budget_max, budget_type, is_remote, skills, created_at, status")
          .eq("id", idParam)
          .single();

        if (cancelled) return;

        if (error) {
          if (DEV) {
            console.error("[job-detail] Supabase error:", {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint,
            });
          }
          // PGRST116 = "Results contain 0 rows" → true not-found
          // 42703      = undefined column (migration not applied)
          // 401/403    = RLS / no access
          if (error.code === "42703") {
            // Column missing in DB — migration not applied.
            // Fall back to showing an error rather than "not found".
            setFetchError("Greška pri učitavanju — kontaktirajte podršku. (42703)");
          } else {
            setJob(null);
          }
        } else if (!data) {
          setJob(null);
        } else {
          setJob(data as Job);
          if (data.category_id) {
            const { data: cat } = await supabase
              .from("categories")
              .select("name")
              .eq("id", data.category_id)
              .single();
            if (!cancelled) setCategoryName(cat?.name ?? null);
          }
        }
      } catch (err) {
        if (DEV) console.error("[job-detail] unexpected exception:", err);
        if (!cancelled) setFetchError("Greška pri učitavanju.");
      } finally {
        // Always clear loading, even for stale requests.
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [idParam]);

  useEffect(() => {
    if (!idParam || !user || !job) return;
    if (job.client_id !== user.id) return;
    async function loadCount() {
      try {
        const { count } = await supabase
          .from("proposals")
          .select("id", { count: "exact", head: true })
          .eq("job_id", idParam);
        setProposalCount(count ?? 0);
      } catch {
        setProposalCount(null);
      }
    }
    loadCount();
  }, [idParam, user, job?.client_id]);

  const isOwner = user && job?.client_id === user.id;

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  // ── Error state (e.g. missing column / server error) ───────────────
  if (fetchError) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--danger)" }}>{fetchError}</p>
        <Link href="/jobs">← {sr.backToJobs}</Link>
      </div>
    );
  }

  // ── Not found (loading complete and no job) ────────────────────────
  if (!job) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p>{sr.jobNotFound}</p>
        <Link href="/jobs">← {sr.backToJobs}</Link>
      </div>
    );
  }

  const posted = job.created_at ? new Date(job.created_at).toLocaleDateString("sr-Latn") : "";
  // Show the proposal form for published jobs and for jobs without status set (old data)
  const canApply = job.status === "published" || job.status == null;

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
            {job.status === "closed" && <Badge variant="muted">Zatvoren</Badge>}
            {job.status === "expired" && <Badge variant="cancelled">Istekao</Badge>}
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

          {canApply && (
            <div ref={proposalFormRef}>
              <ProposalForm
                jobId={job.id}
                budgetType={job.budget_type}
                onMounted={actionProposal ? handleProposalFormMounted : undefined}
              />
              {!user && (
                <p style={{ marginTop: 16, fontSize: 14, color: "var(--muted)" }}>
                  <Link href={`/login?next=${encodeURIComponent(`/jobs/${job.id}?action=proposal`)}`} style={{ color: "var(--accent)" }}>Prijavi se</Link> kao izvođač da pošalješ ponudu.
                </p>
              )}
            </div>
          )}

          {job.status === "closed" && (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>Ovaj posao je zatvoren.</p>
          )}
          {job.status === "expired" && (
            <p style={{ margin: 0, color: "var(--danger)", fontSize: 14 }}>Rok za ovaj posao je istekao.</p>
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
