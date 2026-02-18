"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import ReportModal from "../../components/ReportModal";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { sr } from "@/src/lib/strings/sr";

type FreelancerProfile = {
  user_id: string;
  title: string | null;
  bio: string | null;
  skills: string[];
  hourly_rate: number | null;
  portfolio_links: string[];
  verified_badge: boolean;
};

type Profile = {
  id: string;
  full_name: string | null;
  city: string | null;
};

type Review = {
  id: number;
  rating: number;
  text: string | null;
  created_at: string;
};

export default function FreelancerProfilePage() {
  const params = useParams();
  const id = String(params.id);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [freelancerProfile, setFreelancerProfile] = useState<FreelancerProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const { user } = useAuth();

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
        setFreelancerProfile(null);
        setLoading(false);
        return;
      }
      setProfile(profData as Profile);

      const { data: fpData } = await supabase
        .from("freelancer_profiles")
        .select("user_id, title, bio, skills, hourly_rate, portfolio_links, verified_badge")
        .eq("user_id", id)
        .single();

      setFreelancerProfile((fpData as FreelancerProfile) ?? null);

      const { data: revData } = await supabase
        .from("reviews")
        .select("id, rating, text, created_at")
        .eq("reviewee_id", id)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(5);

      setReviews((revData as Review[]) ?? []);

      const { data: avgData } = await supabase
        .from("reviews")
        .select("rating")
        .eq("reviewee_id", id)
        .eq("is_hidden", false);

      const ratings = (avgData ?? []).map((r: { rating: number }) => r.rating);
      setReviewCount(ratings.length);
      const avg = ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null;
      setAvgRating(avg);

      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p>{sr.profileNotFound}</p>
        <Link href="/jobs" style={{ color: "var(--accent)" }}>← Nazad na poslove</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/jobs" style={{ fontSize: 14, marginBottom: 16, display: "inline-block", color: "var(--accent)" }}>
        ← Nazad na poslove
      </Link>

      {/* Hero card */}
      <Card style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>Izvođač</p>
        <h1 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 600 }}>{profile.full_name || "Izvođač"}</h1>
        {profile.city && <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>{profile.city}</p>}
        {freelancerProfile?.title && (
          <p style={{ margin: "8px 0 0", fontWeight: 500 }}>{freelancerProfile.title}</p>
        )}
        {freelancerProfile?.verified_badge && (
          <Badge variant="accent" style={{ marginTop: 8 }}>✓ Verifikovan</Badge>
        )}
      </Card>

      {/* Stats row */}
      {(avgRating != null || freelancerProfile?.hourly_rate != null) && (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
          {avgRating != null && (
            <Card style={{ padding: 16, flex: 1, minWidth: 140 }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Prosečna ocjena</p>
              <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 600, color: "var(--accent)" }}>
                {avgRating.toFixed(1)} ★ ({reviewCount} ocjena)
              </p>
            </Card>
          )}
          {freelancerProfile?.hourly_rate != null && (
            <Card style={{ padding: 16, flex: 1, minWidth: 140 }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Satnica</p>
              <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 600, color: "var(--accent)" }}>
                {freelancerProfile.hourly_rate} €/h
              </p>
            </Card>
          )}
        </div>
      )}

      {freelancerProfile?.bio && (
        <Card style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>O meni</h3>
          <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--muted)" }}>{freelancerProfile.bio}</p>
        </Card>
      )}

      {freelancerProfile?.skills && freelancerProfile.skills.length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Vještine</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {freelancerProfile.skills.map((s, i) => (
              <Badge key={i} variant="muted">{s}</Badge>
            ))}
          </div>
        </Card>
      )}

      {reviews.length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Ocjene</h3>
          {reviews.map((r) => (
            <div
              key={r.id}
              style={{
                marginBottom: 16,
                paddingBottom: 16,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ color: "var(--accent)", fontWeight: 500 }}>{r.rating} ★</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {new Date(r.created_at).toLocaleDateString("sr-Latn")}
                </span>
              </div>
              {r.text && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--muted)" }}>{r.text}</p>}
            </div>
          ))}
        </Card>
      )}

      {user && (
        <p style={{ marginTop: 24 }}>
          <Button variant="secondary" onClick={() => setShowReport(true)}>
            {sr.report}
          </Button>
        </p>
      )}
      {showReport && (
        <ReportModal
          targetType="profile"
          targetId={id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
