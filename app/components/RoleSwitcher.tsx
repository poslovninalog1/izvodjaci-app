"use client";

import { useState, useRef, useEffect } from "react";
import { useActiveRole } from "@/src/lib/role/useActiveRole";

const DEV = process.env.NODE_ENV === "development";

export default function RoleSwitcher() {
  const { role, isLoading, setRole } = useActiveRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <span style={{ fontSize: 12, color: "var(--muted)" }}>Mod: …</span>
    );
  }

  const label = role === "client" ? "Poslodavac" : "Izvođač";
  const otherRole: "client" | "freelancer" = role === "client" ? "freelancer" : "client";
  const otherLabel = otherRole === "client" ? "Poslodavac" : "Izvođač";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 500,
          background: "var(--panel2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text)",
          cursor: "pointer",
        }}
      >
        Mod: {label} ▼
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            minWidth: 140,
            zIndex: 100,
          }}
        >
          <button
            type="button"
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              textAlign: "left",
              background: "none",
              border: "none",
              fontSize: 13,
              cursor: "pointer",
              color: role === otherRole ? "var(--muted)" : "var(--text)",
            }}
            onClick={async () => {
              try {
                await setRole(otherRole);
                setOpen(false);
              } catch (e) {
                if (DEV) console.debug("[RoleSwitcher] setRole failed", e);
              }
            }}
          >
            Prebaci na {otherLabel}
          </button>
        </div>
      )}
    </div>
  );
}
