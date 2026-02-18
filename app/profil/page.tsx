"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

export default function ProfilPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/profil");
      return;
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
        <p>Učitavanje...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <h1>Profil</h1>
      <p>Ovdje će kasnije doći iskustva i prijave na poslove.</p>
      <p style={{ opacity: 0.8 }}>
        Uloga: {profile?.role ?? "—"} | Ime: {profile?.name ?? user.email}
      </p>
    </div>
  );
}
