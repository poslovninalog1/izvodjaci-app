"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../context/ToastContext";
import { ONBOARDING_STORAGE_KEY, ONBOARDING_ROLE_KEY } from "@/src/lib/onboarding";
import DebugPanel from "../components/DebugPanel";

type AccountType = "physical" | "legal";
type Role = "ponudjac" | "izvodjac";

const ACTIVITIES = [
  "Keramičar",
  "Električar",
  "Moler",
  "Gipsar",
  "Vodoinstalater",
  "Stolar",
  "Bravar",
  "Klima radovi",
  "Građevinski radovi",
  "Ostalo",
];

export default function OnboardingHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading, onboardingCompleted, refreshProfile } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [accountType, setAccountType] = useState<AccountType | "">("");
  const [role, setRole] = useState<Role | "">("");
  const [activity, setActivity] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [finishing, setFinishing] = useState(false);

  // Route guard: loading -> loader; not user -> login; already onboarded (localStorage + role) -> redirect to next or /
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/start");
      return;
    }
    if (onboardingCompleted) {
      const nextUrl = searchParams.get("next") || "/";
      router.replace(nextUrl);
      return;
    }
  }, [user, onboardingCompleted, loading, router, searchParams]);

  const next = () => {
    setErrorMsg("");

    if (step === 1) {
      if (!accountType) return setErrorMsg("Izaberi tip lica.");
      setStep(accountType === "legal" ? 3 : 2);
    }

    if (step === 2) {
      if (!role) return setErrorMsg("Izaberi ulogu.");
      setStep(3);
    }

    if (step === 3) {
      if (!activity) return setErrorMsg("Izaberi djelatnost.");
      finish();
    }
  };

  const back = () => {
    setErrorMsg("");
    if (step === 2) setStep(1);
    if (step === 3) setStep(accountType === "legal" ? 1 : 2);
  };

  const finish = async () => {
    setFinishing(true);
    setErrorMsg("");

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      setFinishing(false);
      router.replace("/login?next=/start");
      return;
    }

    const dbRole = accountType === "legal" ? "client" : (role === "ponudjac" ? "client" : "freelancer");
    // Only update columns that exist in actual schema: id, name, municipalities, skills, price_from, rating, deactivated, created_at; role may exist.
    const profileUpdate: Record<string, unknown> = {
      role: dbRole,
      name: profile?.name ?? (authUser.user_metadata?.full_name as string) ?? "",
      skills: profile?.skills ?? "",
      municipalities: profile?.municipalities ?? "",
    };

    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", authUser.id);

    if (profileError) {
      toast.error("Greška pri čuvanju profila: " + profileError.message);
      if (process.env.NODE_ENV === "development") {
        console.debug("profiles update result (non-fatal)", profileError);
      }
      // Do not return: set localStorage and proceed so onboarding flow completes.
    } else if (dbRole === "freelancer") {
      await supabase.from("freelancer_profiles").upsert(
        { user_id: authUser.id, title: activity },
        { onConflict: "user_id" }
      );
    } else {
      await supabase.from("client_profiles").upsert(
        { user_id: authUser.id },
        { onConflict: "user_id" }
      );
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
      localStorage.setItem(ONBOARDING_ROLE_KEY, dbRole);
    }
    await refreshProfile(authUser.id);

    setFinishing(false);
    const nextUrl = searchParams.get("next") || "/";
    router.replace(nextUrl);
    router.refresh();
  };

  if (loading || !user) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
        <p>Učitavanje...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <h1>Dobrodošli na izvođači</h1>

      <div style={{ opacity: 0.7, marginBottom: 12 }}>
        Korak {step}/3
      </div>

      {step === 1 && (
        <section className="card">
          <h2>Fizičko ili pravno lice?</h2>

          <div className="row">
            <button
              className={`tabBtn ${accountType === "physical" ? "active" : ""}`}
              onClick={() => setAccountType("physical")}
              type="button"
            >
              Fizičko lice
            </button>

            <button
              className={`tabBtn ${accountType === "legal" ? "active" : ""}`}
              onClick={() => setAccountType("legal")}
              type="button"
            >
              Pravno lice
            </button>
          </div>
        </section>
      )}

      {step === 2 && accountType === "physical" && (
        <section className="card">
          <h2>Ponuđač ili izvođač?</h2>

          <div className="row">
            <button
              className={`tabBtn ${role === "ponudjac" ? "active" : ""}`}
              onClick={() => setRole("ponudjac")}
              type="button"
            >
              Ponuđač (objavljuje oglas posla)
            </button>

            <button
              className={`tabBtn ${role === "izvodjac" ? "active" : ""}`}
              onClick={() => setRole("izvodjac")}
              type="button"
            >
              Izvođač (radnik)
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card">
          <h2>Djelatnost</h2>

          <div className="col">
            {ACTIVITIES.map((a) => (
              <button
                key={a}
                className={`tabBtn ${activity === a ? "active" : ""}`}
                onClick={() => setActivity(a)}
                type="button"
              >
                {a}
              </button>
            ))}
          </div>
        </section>
      )}

      {errorMsg && (
        <div style={{ marginTop: 12, padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#b91c1c" }}>
          {errorMsg}
        </div>
      )}

      <DebugPanel
        userId={user?.id}
        profileRole={profile?.role}
        onboardingCompleted={onboardingCompleted}
        lastError={errorMsg || null}
      />

      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button onClick={back} type="button" disabled={finishing}>Nazad</button>
        <button onClick={next} type="button" disabled={finishing}>
          {finishing ? "Čuvanje..." : step === 3 ? "Završi" : "Nastavi"}
        </button>
      </div>
    </div>
  );
}
