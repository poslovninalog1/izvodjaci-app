"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import InboxSidebar from "./InboxSidebar";
import { sr } from "@/src/lib/strings/sr";

export default function InboxPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/inbox");
      return;
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, maxWidth: 1000, margin: "0 auto", minHeight: 500 }}>
      <div>
        <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>Inbox</h1>
        <InboxSidebar />
      </div>
      <Card style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Izaberi razgovor sa liste ili otvori direktno iz ugovora.
        </p>
      </Card>
    </div>
  );
}
