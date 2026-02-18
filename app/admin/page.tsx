"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import ConfirmModal from "../components/ui/ConfirmModal";
import { sr } from "@/src/lib/strings/sr";

type Tab = "reports" | "jobs" | "users" | "reviews";

type Report = {
  id: number;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
};

type Job = {
  id: number;
  title: string | null;
  status: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  deactivated: boolean | null;
  created_at: string;
};

type Review = {
  id: number;
  contract_id: number;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  text: string | null;
  is_hidden: boolean | null;
  created_at: string;
};

export default function AdminPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [jobSearch, setJobSearch] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{
    type: "deactivate" | "hideReview";
    id: string | number;
    payload?: boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/admin");
      return;
    }
    if (!authLoading && profile?.role !== "admin") {
      router.replace("/");
      return;
    }
  }, [user, profile, authLoading, router]);

  useEffect(() => {
    if (!user || profile?.role !== "admin") return;
    async function load() {
      setLoading(true);
      if (tab === "reports") {
        const { data } = await supabase
          .from("reports")
          .select("id, reporter_id, target_type, target_id, reason, created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        setReports((data as Report[]) ?? []);
      }
      if (tab === "jobs") {
        let q = supabase.from("jobs").select("id, title, status, created_at").order("created_at", { ascending: false });
        if (jobSearch.trim()) q = q.ilike("title", `%${jobSearch.trim()}%`);
        if (jobStatusFilter) q = q.eq("status", jobStatusFilter);
        const { data } = await q.limit(50);
        setJobs((data as Job[]) ?? []);
      }
      if (tab === "users") {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, role, deactivated, created_at")
          .order("created_at", { ascending: false })
          .limit(100);
        setProfiles((data as Profile[]) ?? []);
      }
      if (tab === "reviews") {
        const { data } = await supabase
          .from("reviews")
          .select("id, contract_id, reviewer_id, reviewee_id, rating, text, is_hidden, created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        setReviews((data as Review[]) ?? []);
      }
      setLoading(false);
    }
    load();
  }, [user?.id, profile?.role, tab, jobSearch, jobStatusFilter]);

  const handleDeactivate = async (userId: string, deactivate: boolean) => {
    setActionLoading(true);
    const { error } = await supabase.from("profiles").update({ deactivated: deactivate }).eq("id", userId);
    setActionLoading(false);
    if (error) toast.error("Greška: " + error.message);
    else {
      setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, deactivated: deactivate } : p)));
      toast.success(deactivate ? "Korisnik deaktiviran." : "Korisnik aktiviran.");
      setConfirmAction(null);
    }
  };

  const handleHideReview = async (reviewId: number, hide: boolean) => {
    setActionLoading(true);
    const { error } = await supabase.from("reviews").update({ is_hidden: hide }).eq("id", reviewId);
    setActionLoading(false);
    if (error) toast.error("Greška: " + error.message);
    else {
      setReviews((prev) => prev.map((r) => (r.id === reviewId ? { ...r, is_hidden: hide } : r)));
      toast.success(hide ? "Ocjena sakrivena." : "Ocjena prikazana.");
      setConfirmAction(null);
    }
  };

  if (authLoading || !user || profile?.role !== "admin") {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "reports", label: "Prijave" },
    { id: "jobs", label: "Poslovi" },
    { id: "users", label: "Korisnici" },
    { id: "reviews", label: "Ocjene" },
  ];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 24px", fontSize: 24, fontWeight: 600 }}>Admin panel</h1>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 4, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: tab === t.id ? "var(--accent)" : "transparent",
                color: tab === t.id ? "#fff" : "var(--muted)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          {loading ? (
            <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
          ) : (
            <>
              {tab === "reports" && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: 12 }}>ID</th>
                        <th style={{ padding: 12 }}>Tip</th>
                        <th style={{ padding: 12 }}>Target ID</th>
                        <th style={{ padding: 12 }}>Razlog</th>
                        <th style={{ padding: 12 }}>Datum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: 12 }}>{r.id}</td>
                          <td style={{ padding: 12 }}>{r.target_type}</td>
                          <td style={{ padding: 12 }}>{r.target_id}</td>
                          <td style={{ padding: 12, maxWidth: 200 }}>{(r.reason || "").slice(0, 80)}…</td>
                          <td style={{ padding: 12, color: "var(--muted)" }}>{new Date(r.created_at).toLocaleString("sr-Latn")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {reports.length === 0 && <p style={{ color: "var(--muted)" }}>Nema prijava.</p>}
                </div>
              )}

              {tab === "jobs" && (
                <>
                  <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                    <Input
                      type="search"
                      placeholder="Pretraži po naslovu..."
                      value={jobSearch}
                      onChange={(e) => setJobSearch(e.target.value)}
                      style={{ width: 300 }}
                    />
                    <Select value={jobStatusFilter} onChange={(e) => setJobStatusFilter(e.target.value)}>
                      <option value="">Svi statusi</option>
                      <option value="open">Otvoren</option>
                    </Select>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                          <th style={{ padding: 12 }}>Naslov</th>
                          <th style={{ padding: 12 }}>Status</th>
                          <th style={{ padding: 12 }}>Datum</th>
                          <th style={{ padding: 12 }}>Akcije</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((j) => (
                          <tr key={j.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: 12 }}>
                              <Link href={`/jobs/${j.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                                {j.title || "—"}
                              </Link>
                            </td>
                            <td style={{ padding: 12 }}><Badge variant={j.status === "open" ? "active" : "muted"}>{j.status ?? "—"}</Badge></td>
                            <td style={{ padding: 12, color: "var(--muted)" }}>{new Date(j.created_at).toLocaleDateString("sr-Latn")}</td>
                            <td style={{ padding: 12 }}>—</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {jobs.length === 0 && <p style={{ color: "var(--muted)" }}>Nema poslova.</p>}
                  </div>
                </>
              )}

              {tab === "users" && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: 12 }}>Ime</th>
                        <th style={{ padding: 12 }}>Uloga</th>
                        <th style={{ padding: 12 }}>Status</th>
                        <th style={{ padding: 12 }}>Akcije</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.map((p) => (
                        <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: 12 }}>{p.full_name || p.id.slice(0, 8)}</td>
                          <td style={{ padding: 12 }}>{p.role || "—"}</td>
                          <td style={{ padding: 12 }}>{p.deactivated ? <Badge variant="cancelled">Deaktiviran</Badge> : <Badge variant="active">Aktivan</Badge>}</td>
                          <td style={{ padding: 12 }}>
                            <Button
                              variant="secondary"
                              style={{ padding: "4px 10px", fontSize: 12 }}
                              onClick={() => setConfirmAction({ type: "deactivate", id: p.id, payload: !p.deactivated })}
                            >
                              {p.deactivated ? "Aktiviraj" : "Deaktiviraj"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {profiles.length === 0 && <p style={{ color: "var(--muted)" }}>Nema korisnika.</p>}
                </div>
              )}

              {tab === "reviews" && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: 12 }}>Ocjena</th>
                        <th style={{ padding: 12 }}>Tekst</th>
                        <th style={{ padding: 12 }}>Datum</th>
                        <th style={{ padding: 12 }}>Akcije</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviews.map((r) => (
                        <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: 12 }}>{r.rating} ★</td>
                          <td style={{ padding: 12, maxWidth: 200 }}>{(r.text || "").slice(0, 60)}…</td>
                          <td style={{ padding: 12, color: "var(--muted)" }}>{new Date(r.created_at).toLocaleDateString("sr-Latn")}</td>
                          <td style={{ padding: 12 }}>
                            <Button
                              variant="secondary"
                              style={{ padding: "4px 10px", fontSize: 12 }}
                              onClick={() => setConfirmAction({ type: "hideReview", id: r.id, payload: !r.is_hidden })}
                            >
                              {r.is_hidden ? "Prikaži" : "Sakrij"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {reviews.length === 0 && <p style={{ color: "var(--muted)" }}>Nema ocjena.</p>}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {confirmAction && (
        <ConfirmModal
          title={
            confirmAction.type === "deactivate"
              ? (confirmAction.payload ? "Deaktiviraj korisnika?" : "Aktiviraj korisnika?")
              : (confirmAction.payload ? "Sakrij ocjenu?" : "Prikaži ocjenu?")
          }
          message={
            confirmAction.type === "deactivate"
              ? (confirmAction.payload ? "Korisnik neće moći objavljivati poslove, slati ponude niti poruke." : "Korisnik će ponovo moći koristiti platformu.")
              : (confirmAction.payload ? "Ocjena neće biti vidljiva na profilu." : "Ocjena će biti vidljiva na profilu.")
          }
          confirmLabel={
            confirmAction.type === "deactivate"
              ? (confirmAction.payload ? "Deaktiviraj" : "Aktiviraj")
              : (confirmAction.payload ? "Sakrij" : "Prikaži")
          }
          variant={confirmAction.type === "deactivate" && confirmAction.payload ? "danger" : "primary"}
          loading={actionLoading}
          onConfirm={async () => {
            if (confirmAction.type === "deactivate") await handleDeactivate(confirmAction.id as string, confirmAction.payload!);
            if (confirmAction.type === "hideReview") await handleHideReview(confirmAction.id as number, confirmAction.payload!);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
