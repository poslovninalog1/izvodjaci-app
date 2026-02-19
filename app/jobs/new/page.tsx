"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../../context/ToastContext";
import { isClientForApp } from "@/src/lib/onboarding";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Textarea from "../../components/ui/Textarea";
import Button from "../../components/ui/Button";
import DebugPanel from "../../components/DebugPanel";

const DESCRIPTION_MIN_LENGTH = 1;

const FALLBACK_CITIES = ["Podgorica", "Nikšić", "Budva", "Bar", "Herceg Novi"];

export default function NewJob() {
  const router = useRouter();
  const { user, profile, loading, onboardingCompleted } = useAuth();
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [budgetType, setBudgetType] = useState("fixed");
  const [submitting, setSubmitting] = useState(false);
  const [insertError, setInsertError] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [cities, setCities] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  // Route guard: loading -> loader only; !user -> login; !onboardingCompleted -> /start?next=; not client -> /jobs
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/jobs/new");
      return;
    }
    if (!onboardingCompleted) {
      router.replace("/start?next=/jobs/new");
      return;
    }
    if (!isClientForApp(profile ?? null)) {
      router.replace("/jobs");
      return;
    }
  }, [user, profile, loading, onboardingCompleted, router]);

  useEffect(() => {
    async function loadOptions() {
      setCitiesLoading(true);
      setCitiesError(null);
      const [catRes, cityRes] = await Promise.all([
        supabase.from("categories").select("id, name, slug").order("sort_order"),
        supabase.from("cities").select("id, name, slug").order("sort_order"),
      ]);
      if (catRes.data) setCategories(catRes.data);
      if (cityRes.error) {
        setCitiesError(cityRes.error.message);
        if (process.env.NODE_ENV === "development") console.error("[jobs/new] cities fetch:", cityRes.error);
        setCities([]);
      } else if (cityRes.data && cityRes.data.length > 0) {
        setCities(cityRes.data);
        if (process.env.NODE_ENV === "development") console.log("[jobs/new] cities loaded:", cityRes.data.length);
      } else {
        setCities([]);
      }
      setCitiesLoading(false);
    }
    loadOptions();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInsertError(null);

    const descTrimmed = description.trim();
    const cityVal = city?.trim() || "";
    if (descTrimmed.length < DESCRIPTION_MIN_LENGTH) {
      setInsertError("Opis je obavezan (najmanje " + DESCRIPTION_MIN_LENGTH + " karakter).");
      toast.error("Opis je obavezan.");
      return;
    }
    if (!cityVal) {
      setInsertError("Grad / opština je obavezan.");
      toast.error("Izaberite grad ili opštinu.");
      return;
    }

    setSubmitting(true);

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      setSubmitting(false);
      toast.error("Morate biti prijavljeni.");
      router.replace("/login?next=/jobs/new");
      return;
    }
    if (!authUser?.id) {
      setSubmitting(false);
      const msg = "Auth user has no id";
      if (process.env.NODE_ENV === "development") console.error("[jobs/new]", msg);
      toast.error("Greška prijavljivanja. Pokušajte ponovo.");
      return;
    }

    const payload = {
      client_id: authUser.id,
      status: "published",
      title: title.trim() || "",
      description: descTrimmed,
      city: cityVal,
      budget_type: budgetType,
      budget_min: budgetMin ? Number(budgetMin) : null,
      budget_max: budgetMax ? Number(budgetMax) : null,
      category_id: categoryId ? Number(categoryId) : null,
    };

    const { data, error } = await supabase
      .from("jobs")
      .insert(payload)
      .select("id")
      .single();

    setSubmitting(false);

    if (error) {
      const msg = error.message || "Insert failed";
      setInsertError(msg);
      toast.error("Greška: " + msg);
      if (process.env.NODE_ENV === "development") {
        console.error("[jobs/new] insert failed:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
      }
      return;
    }

    if (!data?.id) {
      setInsertError("Posao nije sačuvan.");
      toast.error("Posao nije sačuvan. Pokušajte ponovo.");
      if (process.env.NODE_ENV === "development") console.error("[jobs/new] insert returned no id:", { data });
      return;
    }

    toast.success("Posao je objavljen.");
    router.push("/jobs");
    router.refresh();
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 520, margin: "40px auto" }}>
        <p style={{ color: "var(--muted)" }}>Učitavanje...</p>
      </div>
    );
  }

  if (!user || !isClientForApp(profile ?? null)) {
    return (
      <div style={{ maxWidth: 520, margin: "40px auto" }}>
        <p style={{ color: "var(--muted)" }}>Učitavanje...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <Link href="/client/jobs" style={{ fontSize: 14, marginBottom: 16, display: "inline-block", color: "var(--accent)" }}>
        ← Nazad na moje poslove
      </Link>

      <Card>
        <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>Objavi posao</h1>

        {insertError && (
          <div style={{ marginBottom: 16, padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#b91c1c" }}>
            {insertError}
          </div>
        )}

        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Naziv posla</label>
            <Input placeholder="Naziv posla" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Opis</label>
            <Textarea placeholder="Opis posla" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Kategorija</label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Kategorija (opciono)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Grad / opština</label>
            <Select value={city ?? ""} onChange={(e) => setCity(e.target.value)}>
              <option value="">Grad (opciono)</option>
              {citiesLoading && (
                <option value="" disabled>Učitavanje...</option>
              )}
              {!citiesLoading && citiesError && (
                <option value="" disabled>Nije moguće učitati gradove</option>
              )}
              {!citiesLoading && cities.length > 0 && cities.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
              {!citiesLoading && !citiesError && cities.length === 0 && FALLBACK_CITIES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </Select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Tip budžeta</label>
            <Select value={budgetType} onChange={(e) => setBudgetType(e.target.value)}>
              <option value="fixed">Fiksni budžet</option>
              <option value="hourly">Po satu</option>
            </Select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Budžet min (€)</label>
              <Input type="number" step="0.01" min="0" placeholder="Min" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Budžet max (€)</label>
              <Input type="number" step="0.01" min="0" placeholder="Max" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
            </div>
          </div>
          <Button type="submit" variant="primary" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Objavljujem..." : "Objavi posao"}
          </Button>
        </form>
      </Card>

      <DebugPanel
        userId={user?.id}
        profileRole={profile?.role}
        onboardingCompleted={onboardingCompleted}
        lastError={insertError}
      />
    </div>
  );
}
