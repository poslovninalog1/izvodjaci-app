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

  const label = role === "client" ? "Poslodavac" : "Izvođač";

  if (isLoading) {
    return (
      <span style={{ fontSize: 12, color: "var(--muted)" }}>…</span>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="premium-nav-item"
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
        {label} ▼
      </button>
      {open && (
        <div
          className="premium-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "#fff",
            minWidth: 140,
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            className="premium-menu-item"
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              textAlign: "left",
              background: role === "freelancer" ? "var(--panel2)" : "none",
              border: "none",
              fontSize: 13,
              cursor: role === "freelancer" ? "default" : "pointer",
              color: role === "freelancer" ? "var(--text)" : "var(--muted)",
            }}
            onClick={async () => {
              if (role === "client") {
                try {
                  await setRole("freelancer");
                  setOpen(false);
                } catch (e) {
                  if (DEV) console.debug("[RoleSwitcher] setRole failed", e);
                }
              }
            }}
          >
            Izvođač
          </button>
          <button
            type="button"
            className="premium-menu-item"
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              textAlign: "left",
              background: role === "client" ? "var(--panel2)" : "none",
              border: "none",
              fontSize: 13,
              cursor: role === "client" ? "default" : "pointer",
              color: role === "client" ? "var(--text)" : "var(--muted)",
            }}
            onClick={async () => {
              if (role === "freelancer") {
                try {
                  await setRole("client");
                  setOpen(false);
                } catch (e) {
                  if (DEV) console.debug("[RoleSwitcher] setRole failed", e);
                }
              }
            }}
          >
            Poslodavac
          </button>
        </div>
      )}
    </div>
  );
}
