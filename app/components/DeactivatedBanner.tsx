"use client";

import { useAuth } from "../context/AuthContext";

export default function DeactivatedBanner() {
  const { profile } = useAuth();
  if (!profile?.deactivated) return null;
  return (
    <div
      style={{
        padding: 12,
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.3)",
        borderRadius: "var(--radius-sm)",
        marginBottom: 16,
        textAlign: "center",
        color: "var(--danger)",
        fontWeight: 500,
      }}
    >
      Nalog je deaktiviran. Ne možeš objavljivati poslove, slati ponude niti poruke.
    </div>
  );
}
