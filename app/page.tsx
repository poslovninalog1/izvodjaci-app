"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function HomeDashboard() {
  const router = useRouter();
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    const raw = localStorage.getItem("onboarding");
    if (!raw) {
      router.push("/start"); // nema onboardinga → odvedi na onboarding
      return;
    }
    try {
      const data = JSON.parse(raw);
      if (!data?.onboarding_done) router.push("/start");
      else setRole(data.role);
    } catch {
      router.push("/start");
    }
  }, []);

  return (
    <section className="homeScene">
      <div className="homeSceneInner">
      <h1>Početna stranica</h1>
      <p>Ovo je tvoj dashboard nakon onboardinga.</p>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        {role === "ponudjac" && (
          <Link href="/jobs/new">Objavi posao</Link>
        )}
        {role === "izvodjac" && (
          <Link href="/profil">Moj profil</Link>
        )}

        <button
          type="button"
          onClick={() => {
            localStorage.removeItem("onboarding");
            router.push("/start");
          }}
        >
          Ponovi onboarding (reset)
        </button>
      </div>
      </div>
    </section>
  );
}
