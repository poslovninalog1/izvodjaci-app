"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import InboxSidebar from "./InboxSidebar";
import NewConversationModal from "./NewConversationModal";

export default function InboxPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [showNewConvo, setShowNewConvo] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/inbox");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>Učitavanje...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        gap: 24,
        maxWidth: 1000,
        margin: "0 auto",
        minHeight: 500,
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Inbox</h1>
          <Button
            variant="primary"
            onClick={() => setShowNewConvo(true)}
            style={{ padding: "6px 14px", fontSize: 13 }}
          >
            + Nova poruka
          </Button>
        </div>
        <InboxSidebar />
      </div>

      <Card
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
        }}
      >
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Izaberi razgovor sa liste ili započni novi.
        </p>
      </Card>

      {showNewConvo && (
        <NewConversationModal onClose={() => setShowNewConvo(false)} />
      )}
    </div>
  );
}
