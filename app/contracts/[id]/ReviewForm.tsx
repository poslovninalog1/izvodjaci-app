"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../../context/ToastContext";
import Card from "../../components/ui/Card";
import Textarea from "../../components/ui/Textarea";
import Button from "../../components/ui/Button";

type Props = {
  contractId: number;
  clientId: string;
  freelancerId: string;
  revieweeName: string;
};

const MAX_TEXT = 500;

export default function ReviewForm({ contractId, clientId, freelancerId, revieweeName }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [existingReview, setExistingReview] = useState<boolean>(false);
  const [checking, setChecking] = useState(true);
  const [rating, setRating] = useState<number>(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const revieweeId = user?.id === clientId ? freelancerId : clientId;

  useEffect(() => {
    if (!user || !contractId) {
      setChecking(false);
      return;
    }
    async function check() {
      const { data } = await supabase
        .from("reviews")
        .select("id")
        .eq("contract_id", contractId)
        .eq("reviewer_id", user!.id)
        .maybeSingle();
      setExistingReview(!!data);
      setChecking(false);
    }
    check();
  }, [contractId, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !rating) return;
    setError("");
    if (text.length > MAX_TEXT) {
      setError(`Tekst može imati najviše ${MAX_TEXT} karaktera.`);
      return;
    }

    setSubmitting(true);
    const { error: err } = await supabase.from("reviews").insert({
      contract_id: contractId,
      reviewer_id: user.id,
      reviewee_id: revieweeId,
      rating,
      text: text.trim() || null,
    });

    setSubmitting(false);
    if (err) {
      if (err.code === "23505") {
        setError("Već si ostavio ocjenu za ovaj ugovor.");
        setExistingReview(true);
      } else {
        setError("Greška: " + err.message);
      }
      return;
    }
    toast.success("Ocjena je poslata!");
    setSubmitted(true);
  };

  if (checking || !user) return null;
  if (existingReview || submitted) {
    return (
      <Card style={{ marginTop: 24 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>
          {submitted ? "Ocjena je poslata!" : "Već si ostavio ocjenu za ovaj ugovor."}
        </p>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card style={{ marginTop: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Ostavi ocjenu za {revieweeName}</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>Ocjena (1–5) *</label>
          <div style={{ display: "flex", gap: 12 }}>
            {[1, 2, 3, 4, 5].map((r) => (
              <label key={r} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="radio"
                  name="rating"
                  value={r}
                  checked={rating === r}
                  onChange={() => setRating(r)}
                  required
                  style={{ accentColor: "var(--accent)" }}
                />
                {r} ★
              </label>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Komentar (opciono, max {MAX_TEXT})</label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_TEXT}
            rows={3}
            placeholder="Opiši iskustvo..."
          />
        </div>
        {error && <p style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</p>}
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Šaljem..." : "Pošalji ocjenu"}
        </Button>
      </Card>
    </form>
  );
}
