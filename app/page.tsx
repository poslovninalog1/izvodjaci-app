"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context/AuthContext";
import LandingHero from "./components/LandingHero";

export default function HomePage() {
  const router = useRouter();
  const { user, loading, onboardingCompleted } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user && !onboardingCompleted) {
      router.push("/start");
    }
  }, [user, onboardingCompleted, loading, router]);

  return <LandingHero />;
}
