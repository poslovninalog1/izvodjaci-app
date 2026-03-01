"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import InboxSidebar from "./InboxSidebar";
import NewConversationModal from "./NewConversationModal";
import type { InboxThread } from "./InboxSidebar";

export default function InboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const prevUserIdRef = useRef<string | undefined>(undefined);

  // Only redirect when truly unauthenticated (auth loaded and no user).
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/inbox");
    }
  }, [user, authLoading, router]);

  // Load threads from v_inbox_threads (same source as sidebar) for auto-open.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("v_inbox_threads")
        .select("conversation_id, title, last_message_at, last_message_preview, last_message_type, unread_count")
        .eq("user_id", user.id)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (process.env.NODE_ENV === "development" && error) {
        console.debug("[inbox page] v_inbox_threads error", { code: error.code, message: error.message, details: error.details });
      }
      if (!cancelled) setThreads((data as InboxThread[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Auto-open prvi thread (najnoviji po last_message_at) na /inbox.
  useEffect(() => {
    if (pathname !== "/inbox" || searchParams.get("new") === "1" || threads.length === 0) return;
    const firstId = String(threads[0].conversation_id);
    router.replace(`/inbox/${firstId}`);
  }, [pathname, searchParams, threads, router]);

  // Open new-conversation modal when URL has ?new=1; then clean URL so refresh doesn't reopen.
  useEffect(() => {
    if (!user) return;
    if (searchParams.get("new") === "1") {
      setShowNewConvo(true);
      router.replace("/inbox", { scroll: false });
    }
  }, [user, searchParams, router]);

  // Clear modal only when session actually changes (different user), not on route/query changes.
  useEffect(() => {
    const currentId = user?.id;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentId) {
      setShowNewConvo(false);
    }
    prevUserIdRef.current = currentId;
  }, [user?.id]);

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
        <InboxSidebar key={user?.id ?? "anon"} />
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
