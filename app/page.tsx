"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "./context/AuthContext";

const LandingHero = dynamic(() => import("./components/LandingHero"), { ssr: false });

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
