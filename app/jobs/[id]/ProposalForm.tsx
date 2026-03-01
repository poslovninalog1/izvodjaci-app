"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useActiveRole } from "@/src/lib/role/useActiveRole";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../../context/ToastContext";
import { buildProposalInsertPayload } from "@/src/lib/proposals/compat";
import Textarea from "../../components/ui/Textarea";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";

type Props = {
  jobId: number | string;
  budgetType: string | null;
  /** Called when form is mounted and ready (e.g. for scroll/focus from parent). */
  onMounted?: () => void;
};

export default function ProposalForm({ jobId, budgetType, onMounted }: Props) {
  const { user, profile } = useAuth();
  const { role: activeRole } = useActiveRole();
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (onMounted && formRef.current) onMounted();
  }, [onMounted]);
  const toast = useToast();
  const [existingProposal, setExistingProposal] = useState<{ id: number } | null>(null);
  const [checking, setChecking] = useState(true);
  const [coverLetter, setCoverLetter] = useState("");
  const [proposedFixed, setProposedFixed] = useState("");
  const [proposedRate, setProposedRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || profile?.role !== "freelancer") {
      setChecking(false);
      return;
    }
    let cancelled = false;
    async function check() {
      try {
        const { data } = await supabase
          .from("proposals")
          .select("id")
          .eq("job_id", jobId)
          .eq("freelancer_id", user!.id)
          .maybeSingle();
        if (!cancelled) setExistingProposal(data as { id: number } | null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [jobId, user, profile?.role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError("");
    if (coverLetter.trim().length < 50) {
      setError("Pismo namjere mora imati najmanje 50 karaktera.");
      return;
    }
    const isFixed = budgetType === "fixed";
    if (isFixed && !proposedFixed.trim()) {
      setError("Unesi predloženu fiksnu cijenu.");
      return;
    }
    if (!isFixed && !proposedRate.trim()) {
      setError("Unesi predloženu satnicu.");
      return;
    }

    setSubmitting(true);
    const payload = buildProposalInsertPayload({
      jobId: String(jobId),
      userId: user.id,
      coverLetter: coverLetter.trim(),
      budgetType,
      proposedFixed: isFixed && proposedFixed.trim() ? Number(proposedFixed) : null,
      proposedRate: !isFixed && proposedRate.trim() ? Number(proposedRate) : null,
    });

    try {
      const { data: inserted, error: err } = await supabase.from("proposals").insert([payload]).select("id").single();
      if (process.env.NODE_ENV === "development") {
        console.debug("[proposals insert]", {
          payload,
          insertedId: inserted?.id,
          error: err
            ? { code: err.code, message: err.message, details: err.details, hint: (err as { hint?: string }).hint }
            : null,
        });
      }
      if (err) {
        if (err.code === "23505") {
          const msg = "Već si poslao ponudu na ovaj posao.";
          setError(msg);
          setExistingProposal({ id: 0 });
        } else if (
          err.code === "42501" ||
          err.message?.toLowerCase().includes("policy") ||
          err.message?.toLowerCase().includes("row level") ||
          err.message?.toLowerCase().includes("row-level")
        ) {
          const msg = "Ne možeš poslati ponudu: nalog nije izvođač ili nemaš pravo pristupa poslu.";
          setError(msg);
          toast.error(msg);
        } else if (
          err.code === "23514" ||
          err.message?.toLowerCase().includes("check") ||
          err.message?.toLowerCase().includes("constraint")
        ) {
          const msg = "Baza nije usklađena (status flow).";
          setError(msg);
          toast.error(msg);
        } else {
          setError("Greška: " + err.message);
        }
        return;
      }
      toast.success("Ponuda je poslata!");
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (checking || !user || profile?.role !== "freelancer" || profile?.deactivated) return null;

  if (activeRole !== "freelancer") {
    return (
      <Card style={{ marginTop: 16 }}>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
          Prebaci na režim Izvođač da pošalješ ponudu.
        </p>
      </Card>
    );
  }

  if (existingProposal || submitted) {
    return (
      <Card style={{ marginTop: 16 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>
          {submitted ? "Ponuda je poslata!" : "Već si poslao ponudu na ovaj posao."}
        </p>
        <Link href="/freelancer/proposals" style={{ marginTop: 8, display: "inline-block", fontSize: 14, color: "var(--accent)" }}>
          Moje ponude →
        </Link>
      </Card>
    );
  }

  return (
    <div ref={formRef}>
      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Pošalji ponudu</h3>
        <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Pismo namjere (min. 50 karaktera) *</label>
        <Textarea
          data-proposal-first-field
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          required
          minLength={50}
          rows={4}
          placeholder="Opiši zašto si pravi izbor za ovaj posao..."
        />
      </div>
      {budgetType === "fixed" ? (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Predložena fiksna cijena (€) *</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={proposedFixed}
            onChange={(e) => setProposedFixed(e.target.value)}
            required
          />
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Predložena satnica (€/h) *</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={proposedRate}
            onChange={(e) => setProposedRate(e.target.value)}
            required
          />
        </div>
      )}
      {error && <p style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</p>}
      <Button type="submit" variant="primary" disabled={submitting} style={{ width: "100%" }}>
        {submitting ? "Šaljem..." : "Pošalji ponudu"}
      </Button>
    </form>
    </div>
  );
}
