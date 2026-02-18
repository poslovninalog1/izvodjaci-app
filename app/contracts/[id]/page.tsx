"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../../context/ToastContext";
import ReviewForm from "./ReviewForm";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { sr } from "@/src/lib/strings/sr";

type Contract = {
  id: number;
  job_id: number;
  client_id: string;
  freelancer_id: string;
  status: string | null;
  started_at: string;
  completed_at: string | null;
  jobs: unknown;
};

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();
  const contractId = Number(params.id);

  const [contract, setContract] = useState<Contract | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [clientName, setClientName] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/contracts/" + contractId);
      return;
    }
  }, [user, authLoading, router, contractId]);

  useEffect(() => {
    if (!user || !contractId) return;
    const uid = user.id;
    async function load() {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, job_id, client_id, freelancer_id, status, started_at, completed_at, jobs(title)")
        .eq("id", contractId)
        .single();

      if (error || !data) {
        setContract(null);
        setLoading(false);
        return;
      }

      const c = data as unknown as Contract;
      if (c.client_id !== uid && c.freelancer_id !== uid) {
        setContract(null);
        setLoading(false);
        return;
      }

      setContract(c);

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", [c.client_id, c.freelancer_id]);
      (profs ?? []).forEach((p: { id: string; full_name: string | null }) => {
        if (p.id === c.client_id) setClientName(p.full_name ?? "—");
        if (p.id === c.freelancer_id) setFreelancerName(p.full_name ?? "—");
      });

      const { data: convData } = await supabase
        .from("conversations")
        .select("id")
        .eq("contract_id", c.id)
        .maybeSingle();
      setConversationId((convData as { id: number } | null)?.id ?? null);

      setLoading(false);
    }
    load();
  }, [user?.id, contractId]);

  const handleComplete = async () => {
    if (!contract || !user || contract.client_id !== user.id) return;
    const { error } = await supabase
      .from("contracts")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", contract.id);

    if (error) toast.error("Greška: " + error.message);
    else {
      setContract({ ...contract, status: "completed", completed_at: new Date().toISOString() });
      toast.success("Ugovor je označen kao završen.");
    }
  };

  const getJobTitle = (c: Contract) => {
    const j = c.jobs;
    if (!j) return "—";
    if (Array.isArray(j)) return (j[0] as { title?: string })?.title ?? "—";
    return (j as { title?: string })?.title ?? "—";
  };

  const getStatusBadge = (s: string | null) => {
    if (s === "active") return <Badge variant="active">Aktivan</Badge>;
    if (s === "completed") return <Badge variant="completed">Završen</Badge>;
    if (s === "cancelled") return <Badge variant="cancelled">Otkazan</Badge>;
    return <Badge variant="muted">{s ?? "—"}</Badge>;
  };

  if (authLoading || !user) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  if (!contract) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p>{sr.contractNotFound}</p>
        <Link href="/contracts" style={{ color: "var(--accent)" }}>← {sr.backToContracts}</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/contracts" style={{ fontSize: 14, marginBottom: 16, display: "inline-block", color: "var(--accent)" }}>
        ← {sr.backToContracts}
      </Link>

      <Card>
        <h1 style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 600 }}>Ugovor: {getJobTitle(contract)}</h1>
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: "0 0 8px" }}><strong>Status:</strong> {getStatusBadge(contract.status)}</p>
          <p style={{ margin: "0 0 8px" }}><strong>Klijent:</strong> {clientName}</p>
          <p style={{ margin: "0 0 8px" }}><strong>Izvođač:</strong> {freelancerName}</p>
          <p style={{ margin: "0 0 8px" }}><strong>Započet:</strong> {contract.started_at ? new Date(contract.started_at).toLocaleDateString("sr-Latn") : "—"}</p>
          {contract.completed_at && (
            <p style={{ margin: 0 }}><strong>Završen:</strong> {new Date(contract.completed_at).toLocaleDateString("sr-Latn")}</p>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {conversationId && (
            <Link href={`/inbox/${conversationId}`}>
              <Button variant="primary">Otvori razgovor</Button>
            </Link>
          )}
          {profile?.role === "client" && contract.status === "active" && (
            <Button variant="secondary" onClick={handleComplete}>
              Označi kao završeno
            </Button>
          )}
        </div>
      </Card>

      {contract.status === "completed" && (
        <ReviewForm
          contractId={contract.id}
          clientId={contract.client_id}
          freelancerId={contract.freelancer_id}
          revieweeName={user.id === contract.client_id ? freelancerName : clientName}
        />
      )}
    </div>
  );
}
