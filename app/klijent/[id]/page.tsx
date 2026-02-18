"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

type Profile = {
  id: string;
  full_name: string | null;
  city: string | null;
};

type ClientProfile = {
  user_id: string;
  company_name: string | null;
};

export default function ClientProfilePage() {
  const params = useParams();
  const id = String(params.id);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    async function load() {
      const { data: profData, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, city")
        .eq("id", id)
        .single();

      if (profErr || !profData) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(profData as Profile);

      const { data: cpData } = await supabase
        .from("client_profiles")
        .select("user_id, company_name")
        .eq("user_id", id)
        .single();

      setClientProfile((cpData as ClientProfile) ?? null);

      const { data: revData } = await supabase
        .from("reviews")
        .select("rating")
        .eq("reviewee_id", id);

      const ratings = (revData ?? []).map((r: { rating: number }) => r.rating);
      setReviewCount(ratings.length);
      setAvgRating(ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null);

      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
        <p>Učitavanje...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
        <p>Profil nije pronađen.</p>
        <Link href="/jobs">← Nazad na poslove</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <Link href="/jobs" style={{ fontSize: 13, marginBottom: 16, display: "inline-block" }}>
        ← Nazad na poslove
      </Link>

      <h1>{profile.full_name || "Klijent"}</h1>
      {clientProfile?.company_name && (
        <p style={{ margin: "4px 0 0", opacity: 0.8 }}>{clientProfile.company_name}</p>
      )}
      {profile.city && <p style={{ margin: "4px 0 0", opacity: 0.8 }}>{profile.city}</p>}

      {(avgRating != null || reviewCount > 0) && (
        <div style={{ marginTop: 20, padding: 16, background: "var(--paper-2)", borderRadius: "var(--radius-md)" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Ocjene</h3>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {avgRating != null ? `${avgRating.toFixed(1)} ★` : "—"} ({reviewCount} ocjena)
          </p>
        </div>
      )}
    </div>
  );
}
