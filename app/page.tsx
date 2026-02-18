"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context/AuthContext";
import { isClientForApp } from "@/src/lib/onboarding";
import Logo from "./components/Logo";
import Button from "./components/ui/Button";

export default function HomePage() {
  const router = useRouter();
  const { user, profile, loading, onboardingCompleted } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/jobs");
      return;
    }
    if (!onboardingCompleted) {
      router.push("/start");
      return;
    }
  }, [user, onboardingCompleted, loading, router]);

  if (loading || !user) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>Učitavanje...</p>
      </div>
    );
  }

  const isClient = isClientForApp(profile ?? null);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <Logo href="/jobs" size="lg" />
      </div>
      <h1 style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 600 }}>Početna stranica</h1>
      <p style={{ marginBottom: 24, color: "var(--muted)" }}>Dobrodošao na izvođači.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/jobs">
          <Button variant="primary">Pregledaj poslove</Button>
        </Link>
        {isClient && !profile?.deactivated && (
          <Link href="/jobs/new">
            <Button variant="secondary">Objavi posao</Button>
          </Link>
        )}
        {profile?.role === "freelancer" && (
          <Link href="/profil">
            <Button variant="secondary">Moj profil</Button>
          </Link>
        )}
        <Link href="/start">
          <Button variant="ghost">Ponovi onboarding</Button>
        </Link>
      </div>
    </div>
  );
}
