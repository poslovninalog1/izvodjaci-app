"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../../../components/ui/Card";
import { sr } from "@/src/lib/strings/sr";

export default function ContractByJobPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const jobId = params.jobId as string;

  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "no_access">("loading");

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/contracts/job/" + encodeURIComponent(jobId));
      return;
    }
  }, [user, authLoading, router, jobId]);

  useEffect(() => {
    if (!user || !jobId) return;

    const uid = user.id;

    async function load() {
      const jobIdVal = /^\d+$/.test(String(jobId)) ? parseInt(jobId, 10) : jobId;

      // Try both client and freelancer (user may have either role)
      const tryQuery = (field: "freelancer_id" | "client_id") =>
        supabase
          .from("contracts")
          .select("id")
          .eq("job_id", jobIdVal)
          .eq(field, uid)
          .maybeSingle();

      let r = await tryQuery("client_id");
      if (r.error || !r.data) {
        r = await tryQuery("freelancer_id");
      }

      if (r.error || !r.data) {
        setStatus("not_found");
        return;
      }

      router.replace(`/contracts/${(r.data as { id: number }).id}`);
      setStatus("found");
    }

    load();
  }, [user?.id, jobId, router]);

  if (authLoading || !user) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  if (status === "loading" || status === "found") {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/contracts" style={{ fontSize: 14, marginBottom: 16, display: "inline-block", color: "var(--accent)" }}>
        ← {sr.backToContracts}
      </Link>
      <Card>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          {status === "no_access"
            ? "Nemate pristup ovom ugovoru."
            : "Ugovor još nije kreiran."}
        </p>
      </Card>
    </div>
  );
}
