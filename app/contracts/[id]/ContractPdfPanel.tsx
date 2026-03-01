"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../../components/ui/Card";

type Props = {
  contractId: number;
};

/**
 * Fetches GET /api/contracts/[id]/pdf. If 200 renders link + iframe; if 404 renders nothing.
 */
export default function ContractPdfPanel({ contractId }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contractId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) setLoading(false);
          return;
        }
        const res = await fetch(`/api/contracts/${contractId}/pdf`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && json.signedUrl) {
          setSignedUrl(json.signedUrl);
        } else {
          setSignedUrl(null);
        }
      } catch {
        if (!cancelled) setSignedUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contractId]);

  if (loading || !signedUrl) {
    return null;
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Ugovor (PDF)</h3>
      <a href={signedUrl} target="_blank" rel="noreferrer" className="inline-block mb-3">
        Preuzmi PDF
      </a>
      <iframe
        src={signedUrl}
        title="Ugovor PDF"
        className="w-full h-[700px] rounded-lg border"
      />
    </Card>
  );
}
