"use client";

import React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { InboxProvider } from "./InboxContext";
import InboxSidebar from "./InboxSidebar";
import NewConversationModal from "./NewConversationModal";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

const NAVBAR_HEIGHT = 80;

function InboxLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [showNewConvo, setShowNewConvo] = useState(false);
  const prevUserIdRef = useRef<string | undefined>(undefined);

  const conversationId = pathname?.startsWith("/inbox/") && pathname !== "/inbox"
    ? pathname.replace("/inbox/", "").split("/")[0] || null
    : null;

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/inbox");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    if (searchParams.get("new") === "1") {
      setShowNewConvo(true);
      router.replace("/inbox", { scroll: false });
    }
  }, [user, searchParams, router]);

  useEffect(() => {
    const currentId = user?.id;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentId) {
      setShowNewConvo(false);
    }
    prevUserIdRef.current = currentId;
  }, [user?.id]);

  // Flatten fragment so single child (page content) is used as center; no right column (participant is in drawer)
  const raw = React.Children.toArray(children);
  const flat =
    raw.length === 1 &&
    typeof raw[0] === "object" &&
    raw[0] !== null &&
    (raw[0] as React.ReactElement).type === React.Fragment
      ? React.Children.toArray((raw[0] as React.ReactElement).props.children)
      : raw;
  const centerContent = flat[0] ?? null;
  const rest = flat.slice(1);

  return (
    <div className="max-w-[1400px] mx-auto px-6">
      <div
        className="grid grid-cols-[320px_minmax(0,1fr)] gap-8 h-[calc(100vh-80px)]"
        style={{ minHeight: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}
      >
        {/* LEFT: Conversations list */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden min-h-0 flex flex-col">
          <InboxSidebar
            selectedId={conversationId}
            showHeader
            onNewClick={() => setShowNewConvo(true)}
          />
        </div>

        {/* CENTER: Chat only — Participant details open in drawer, not here */}
        <div className="bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-0 min-w-0">
          {centerContent}
        </div>
      </div>

      {rest}

      {showNewConvo && (
        <NewConversationModal onClose={() => setShowNewConvo(false)} />
      )}
    </div>
  );
}

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <InboxProvider>
      <InboxLayoutInner>{children}</InboxLayoutInner>
    </InboxProvider>
  );
}
