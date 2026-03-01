"use client";

import { useActiveRole } from "@/src/lib/role/useActiveRole";
import Button from "./ui/Button";

export default function AccountTypeModal() {
  const { needsAccountTypeModal, setAccountTypeAndContinue } = useActiveRole();

  if (!needsAccountTypeModal) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-md)",
          padding: 24,
          maxWidth: 400,
          width: "100%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600 }}>
          Da li ste fizičko ili pravno lice?
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--muted)" }}>
          Izaberite kako želite da se prikažete kao izvođač.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Button
            variant="primary"
            style={{ width: "100%" }}
            onClick={() => setAccountTypeAndContinue("physical")}
          >
            Fizičko lice
          </Button>
          <Button
            variant="secondary"
            style={{ width: "100%" }}
            onClick={() => setAccountTypeAndContinue("legal")}
          >
            Pravno lice
          </Button>
        </div>
      </div>
    </div>
  );
}
