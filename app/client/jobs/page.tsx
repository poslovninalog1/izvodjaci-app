"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function ClientJobsPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/client/jobs");
      return;
    }
    if (!authLoading && profile?.role !== "client") {
      router.replace("/");
      return;
    }
  }, [user, profile, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    async function load() {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, status, created_at")
        .eq("client_id", uid)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[client/jobs] Supabase error:", error.message, error.code, error.hint);
        setJobs([]);
      } else {
        setJobs((data as Job[]) ?? []);
      }
      setLoading(false);
    }
    load();
  }, [user?.id]);

  const getStatusBadge = (s: string | null) => {
    if (s === "open") return <Badge variant="active">Otvoren</Badge>;
    return <Badge variant="muted">{s ?? "—"}</Badge>;
  };

  if (authLoading || !user || profile?.role !== "client") {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>Moji poslovi</h1>
      <p style={{ marginBottom: 20, color: "var(--muted)" }}>
        <Link href="/jobs/new" style={{ color: "var(--accent)" }}>Objavi novi posao</Link>
      </p>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      ) : jobs.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--muted)" }}>{sr.noClientJobs}</p>
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
                      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link href={`/jobs/${job.id}`}>
                          <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }}>Pogledaj</Button>
                        </Link>
                        <Link href={`/client/jobs/${job.id}/proposals`}>
                          <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }}>Ponude</Button>
                        </Link>
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
