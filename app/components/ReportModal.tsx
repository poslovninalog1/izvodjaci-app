"use client";

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import Modal from "./ui/Modal";
import Textarea from "./ui/Textarea";
import Button from "./ui/Button";

const MAX_REASON = 300;

type Props = {
  targetType: "job" | "profile" | "message" | "review";
  targetId: string;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function ReportModal({ targetType, targetId, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!reason.trim()) {
      setError("Unesi razlog prijave.");
      return;
    }
    if (reason.length > MAX_REASON) {
      setError(`Razlog može imati najviše ${MAX_REASON} karaktera.`);
      return;
    }

    setSubmitting(true);
    setError("");
    const { error: err } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason: reason.trim(),
    });

    setSubmitting(false);
    if (err) {
      setError("Greška: " + err.message);
      return;
    }
    toast.success("Prijava je poslata.");
    onSuccess?.();
    onClose();
  };

  if (!user) return null;

  return (
    <Modal title="Prijavi" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
          Razlog (obavezno, max {MAX_REASON}) *
        </label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_REASON}
          required
          rows={4}
          placeholder="Opiši razlog prijave..."
          style={{ marginBottom: 8 }}
        />
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)" }}>{reason.length} / {MAX_REASON}</p>
        {error && <p style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Odustani
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Šaljem..." : "Pošalji prijavu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
