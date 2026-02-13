"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [accountType, setAccountType] = useState<AccountType | "">("");
  const [role, setRole] = useState<Role | "">("");
  const [activity, setActivity] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

useEffect(() => {
  const raw = localStorage.getItem("onboarding");
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    if (data.onboarding_done) {
      if (data.role === "ponudjac") router.push("/jobs/new");
      else router.push("/profil");
    }
  } catch {}
}, []);


  const next = () => {
    setErrorMsg("");

    if (step === 1) {
      if (!accountType) return setErrorMsg("Izaberi tip lica.");
      // pravno preskače korak 2
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

  const finish = () => {
  const profile = {
    account_type: accountType,
    role: accountType === "legal" ? "ponudjac" : role,
    activity,
    onboarding_done: true,
  };

  localStorage.setItem("onboarding", JSON.stringify(profile));

  // Umjesto /jobs/new ili /profil, vrati na početnu stranicu (dashboard)
  router.push("/");
};


  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <h1>Dobrodošli na platformu Zanatlije</h1>

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
          <h2>Ponuđač ili zanatlija?</h2>

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
              Zanatlija (radnik)
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
        <p style={{ marginTop: 12 }}>
          {errorMsg}
        </p>
      )}

      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button onClick={back} type="button">Nazad</button>
        <button onClick={next} type="button">
          {step === 3 ? "Završi" : "Nastavi"}
        </button>
      </div>
    </div>
  );
}
