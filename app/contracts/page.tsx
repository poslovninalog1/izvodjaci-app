"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { sr } from "@/src/lib/strings/sr";

type Contract = {
  id: number;
  job_id: string;
  client_id: string;
  freelancer_id: string;
  status: string | null;
  started_at: string;
  jobs: unknown;
};

export default function ContractsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/contracts");
      return;
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    async function load() {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, job_id, status, started_at, client_id, freelancer_id, jobs(title)")
        .or(`client_id.eq.${uid},freelancer_id.eq.${uid}`)
        .order("started_at", { ascending: false });

      if (error) {
        console.error("[contracts] Supabase error:", error.code, error.message);
        setContracts([]);
      } else {
        const list = (data as unknown as Contract[]) ?? [];
        setContracts(list);
        const ids = [...new Set(list.flatMap((c) => [c.client_id, c.freelancer_id]).filter(Boolean))];
        if (ids.length > 0) {
          const { data: profData } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ids);
          const map: Record<string, string> = {};
          (profData ?? []).forEach((p: { id: string; full_name: string | null }) => {
            map[p.id] = p.full_name ?? "—";
          });
          setProfiles(map);
        }
      }
      setLoading(false);
    }
    load();
  }, [user?.id]);

  const getJobTitle = (c: Contract) => {
    const j = c.jobs;
    if (!j) return "—";
    if (Array.isArray(j)) return (j[0] as { title?: string })?.title ?? "—";
    return (j as { title?: string })?.title ?? "—";
  };

  const getCounterpartName = (c: Contract) => {
    const counterpartId = c.client_id === user?.id ? c.freelancer_id : c.client_id;
    return profiles[counterpartId] ?? "—";
  };

  const getBadgeVariant = (s: string | null): "active" | "completed" | "cancelled" | "muted" => {
    if (s === "active") return "active";
    if (s === "completed") return "completed";
    if (s === "cancelled") return "cancelled";
    return "muted";
  };

  const getStatusLabel = (s: string | null) => {
    if (s === "active") return "Aktivan";
    if (s === "completed") return "Završen";
    if (s === "cancelled") return "Otkazan";
    return s ?? "—";
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
      <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>Ugovori</h1>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      ) : contracts.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--muted)" }}>{sr.noContracts}</p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {contracts.map((c) => (
            <Link key={c.id} href={`/contracts/${c.id}`}>
              <Card style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{getJobTitle(c)}</strong>
                    <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--muted)" }}>
                      {getCounterpartName(c)} • <Badge variant={getBadgeVariant(c.status)}>{getStatusLabel(c.status)}</Badge>
                    </p>
                  </div>
                  <div style={{ fontSize: 14, color: "var(--muted)" }}>
                    {c.started_at ? new Date(c.started_at).toLocaleDateString("sr-Latn") : "—"}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
