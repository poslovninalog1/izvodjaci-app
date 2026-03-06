"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { sr } from "@/src/lib/strings/sr";

type Job = {
  id: number;
  title: string | null;
  status: string | null;
  created_at: string;
};

export default function SavedJobsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/jobs/saved");
      return;
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const { data: savedRows } = await supabase
          .from("saved_jobs")
          .select("job_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (!savedRows?.length) {
          setJobs([]);
          setLoading(false);
          return;
        }

        const jobIds = savedRows.map((r) => r.job_id);
        const { data: jobsData, error } = await supabase
          .from("jobs")
          .select("id, title, status, created_at")
          .in("id", jobIds);

        if (error) {
          console.error("[jobs/saved] jobs fetch error:", error.message);
          setJobs([]);
        } else {
          const orderMap = new Map(jobIds.map((id, i) => [id, i]));
          const list = (jobsData as Job[]) ?? [];
          list.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
          setJobs(list);
        }
      } catch (err) {
        console.error("[jobs/saved] load exception:", err);
        setJobs([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id]);

  const handleRemove = async (jobId: number) => {
    if (!user) return;
    const { error } = await supabase
      .from("saved_jobs")
      .delete()
      .eq("user_id", user.id)
      .eq("job_id", jobId);
    if (!error) {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    }
  };

  const getJobStatusLabel = (s: string | null): string => {
    if (!s) return "—";
    switch (s) {
      case "published":
      case "open":
        return "Objavljen";
      case "closed":
        return "Zatvoren";
      case "draft":
        return "Nacrt";
      case "expired":
        return "Istekao";
      default:
        return s;
    }
  };

  const getStatusBadge = (s: string | null) => {
    const label = getJobStatusLabel(s);
    if (s === "published" || s === "open") return <Badge variant="active">{label}</Badge>;
    if (s === "closed") return <Badge variant="muted">{label}</Badge>;
    if (s === "expired") return <Badge variant="cancelled">{label}</Badge>;
    if (s === "draft") return <Badge variant="muted">{label}</Badge>;
    return <Badge variant="muted">{label}</Badge>;
  };

  if (authLoading || !user) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>Sačuvani poslovi</h1>
      <p style={{ marginBottom: 20, color: "var(--muted)" }}>
        <Link href="/jobs" style={{ color: "var(--accent)" }}>Pregledaj sve poslove</Link>
      </p>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      ) : jobs.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--muted)" }}>Nemaš sačuvanih poslova.</p>
          <p style={{ margin: "8px 0 0", fontSize: 14 }}>
            <Link href="/jobs" style={{ color: "var(--accent)" }}>Pregledaj poslove</Link> i sačuvaj one koji te zanimaju.
          </p>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: 14, fontSize: 13, fontWeight: 600 }}>Naslov</th>
                  <th style={{ padding: 14, fontSize: 13, fontWeight: 600 }}>Status</th>
                  <th style={{ padding: 14, fontSize: 13, fontWeight: 600 }}>Datum</th>
                  <th style={{ padding: 14, fontSize: 13, fontWeight: 600 }}>Akcije</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: 14 }}>
                      <Link href={`/jobs/${job.id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}>
                        {job.title || "Bez naslova"}
                      </Link>
                    </td>
                    <td style={{ padding: 14 }}>{getStatusBadge(job.status)}</td>
                    <td style={{ padding: 14, color: "var(--muted)", fontSize: 14 }}>
                      {job.created_at ? new Date(job.created_at).toLocaleDateString("sr-Latn") : "—"}
                    </td>
                    <td style={{ padding: 14 }}>
                      <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Link href={`/jobs/${job.id}`}>
                          <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }}>Pogledaj</Button>
                        </Link>
                        <Button
                          variant="secondary"
                          style={{ padding: "6px 12px", fontSize: 12 }}
                          onClick={() => handleRemove(job.id)}
                        >
                          Ukloni iz sačuvanih
                        </Button>
                      </span>
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
