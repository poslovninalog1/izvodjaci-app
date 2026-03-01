"use client";

import { usePathname } from "next/navigation";
import { useActiveRole } from "@/src/lib/role/useActiveRole";

export default function RouteModeBanner() {
  const pathname = usePathname();
  const { role, isLoading, setRole } = useActiveRole();

  if (isLoading) return null;
  const onClient = pathname.startsWith("/client");
  const onFreelancer = pathname.startsWith("/freelancer");
  const mismatch =
    (onClient && role === "freelancer") || (onFreelancer && role === "client");
  if (!mismatch) return null;

  const otherRole = role === "client" ? "freelancer" : "client";
  const otherLabel = otherRole === "client" ? "Poslodavac" : "Izvođač";
  const message =
    role === "freelancer"
      ? "Trenutno si u režimu Izvođač. Prebaci na Poslodavac da koristiš stranice za poslodavce."
      : "Trenutno si u režimu Poslodavac. Prebaci na Izvođač da koristiš stranice za izvođače.";

  return (
    <div
      style={{
        padding: "8px 24px",
        fontSize: 13,
        background: "var(--panel2)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span style={{ color: "var(--muted)" }}>{message}</span>
      <button
        type="button"
        onClick={() => setRole(otherRole)}
        style={{
          padding: "4px 10px",
          fontSize: 12,
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
        }}
      >
        Prebaci na {otherLabel}
      </button>
    </div>
  );
}
