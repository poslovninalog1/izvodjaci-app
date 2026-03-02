"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { useInboxContext } from "./InboxContext";
import { supabase } from "@/src/lib/supabaseClient";
import { relativeTime } from "@/src/lib/time";

const DEV = process.env.NODE_ENV === "development";

export type InboxThread = {
  conversation_id: string | number;
  user_id?: string;
  other_user_id?: string | null;
  title?: string | null;
  other_name?: string | null;
  other_user_name?: string | null;
  last_message_at: string | null;
  last_message_text?: string | null;
  last_message_type?: string | null;
  last_message_preview?: string | null;
  unread_count: number;
};

function previewLabel(type: string | null | undefined): string {
  if (!type) return "📎 Prilog";
  switch (type) {
    case "image":
      return "📷 Slika";
    case "video":
      return "🎥 Video";
    case "audio":
      return "🎧 Audio";
    case "file":
      return "📎 Prilog";
    default:
      return "📎 Prilog";
  }
}

function getSubtitlePreview(
  last_message_type: string | null | undefined,
  last_message_text: string | null | undefined,
  last_message_preview: string | null | undefined
): string {
  const mediaTypes = ["image", "video", "audio", "file"];
  if (last_message_type && mediaTypes.includes(last_message_type)) {
    return previewLabel(last_message_type);
  }
  const raw = last_message_text ?? last_message_preview;
  if (raw != null && String(raw).trim() !== "") {
    const s = String(raw).trim();
    return s.length > 50 ? s.slice(0, 50) + "…" : s;
  }
  return previewLabel(last_message_type);
}

/** Avatar initials from display name (first letters of words, max 2). */
function getInitials(name: string | null | undefined): string {
  if (!name || String(name).trim() === "") return "?";
  const initials = String(name)
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "?";
}

type FilterKind = "all" | "unread" | "archived";

type Props = {
  selectedId?: string | null;
  /** Show "Poruke" title and "+ Nova" button at top (inbox layout) */
  showHeader?: boolean;
  onNewClick?: () => void;
};

export default function InboxSidebar({ selectedId, showHeader, onNewClick }: Props) {
  const { user } = useAuth();
  const inboxContext = useInboxContext();
  const refreshTrigger = inboxContext?.refreshTrigger ?? 0;
  const clearedReadId = inboxContext?.clearedReadId ?? null;
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<{ message: string; code?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  /** Other participant display name per conversation (from conversation_participants + profiles). */
  const [otherParticipantNames, setOtherParticipantNames] = useState<Record<string, string>>({});
  const uid = user?.id ?? null;
  const prevUidRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!uid) return;
    if (prevUidRef.current !== uid) {
      prevUidRef.current = uid;
      hasLoadedOnceRef.current = false;
      setThreads([]);
      setOtherParticipantNames({});
      setFetchError(null);
      setIsInitialLoading(true);
    }
    const isBackgroundRefresh = hasLoadedOnceRef.current;
    if (!isBackgroundRefresh) setIsInitialLoading(true);
    else setIsRefreshing(true);

    const ac = new AbortController();
    abortRef.current = ac;

    async function load() {
      if (DEV) console.time("inbox-sidebar-threads");
      const { data, error } = await supabase
        .from("v_inbox_threads")
        .select("*")
        .eq("user_id", uid)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (DEV) {
        console.timeEnd("inbox-sidebar-threads");
        console.debug("[inbox list fetch]", (data?.length ?? 0));
      }

      if (ac.signal.aborted) return;

      if (error) {
        if (DEV) {
          console.debug("[inbox threads] fetch error", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: (error as { hint?: string }).hint,
          });
        }
        setFetchError({ message: error.message, code: error.code });
        if (!isBackgroundRefresh) setThreads([]);
        setIsInitialLoading(false);
        setIsRefreshing(false);
        return;
      }

      const list = ((data ?? []) as InboxThread[]).map((row) => ({
        ...row,
        other_name: row.other_user_name ?? row.other_name ?? null,
        title: row.other_user_name ?? row.other_name ?? null,
      }));
      setFetchError(null);
      setThreads(list);
      hasLoadedOnceRef.current = true;

      const conversationIds = list.map((t) => t.conversation_id);
      const nameMap: Record<string, string> = {};
      if (conversationIds.length > 0 && uid) {
        const { data: participantsData } = await supabase
          .from("conversation_participants")
          .select("conversation_id, user_id, profiles(full_name, name)")
          .in("conversation_id", conversationIds);
        if (!ac.signal.aborted && participantsData) {
          const participantsByConv: Record<string, { user_id: string; profiles: { full_name?: string | null; name?: string | null } | null }[]> = {};
          for (const row of participantsData as { conversation_id: number; user_id: string; profiles: { full_name?: string | null; name?: string | null } | null }[]) {
            const cid = String(row.conversation_id);
            if (!participantsByConv[cid]) participantsByConv[cid] = [];
            participantsByConv[cid].push({ user_id: row.user_id, profiles: row.profiles ?? null });
          }
          for (const cid of Object.keys(participantsByConv)) {
            const other = participantsByConv[cid].find((p) => p.user_id !== uid);
            if (other) {
              const otherName = (other.profiles?.full_name || other.profiles?.name || "Korisnik").trim() || "Korisnik";
              nameMap[cid] = otherName;
              if (DEV) console.debug("[inbox sidebar] other participant name", { conversationId: cid, otherName });
            }
          }
          setOtherParticipantNames(nameMap);
        }
      } else {
        setOtherParticipantNames({});
      }

      setIsInitialLoading(false);
      setIsRefreshing(false);
    }

    load();
    return () => {
      ac.abort();
      abortRef.current = null;
    };
  }, [uid, refreshTrigger]);

  const unreadMap = useMemo(() => {
    const map: Record<string, number> = {};
    threads.forEach((t) => {
      const cid = String(t.conversation_id);
      map[cid] = clearedReadId === cid ? 0 : (t.unread_count ?? 0);
    });
    return map;
  }, [threads, clearedReadId]);

  const filteredThreads = useMemo(() => {
    let list = threads;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const name = (t.other_user_name ?? t.other_name ?? t.title ?? "").toLowerCase();
        const preview = getSubtitlePreview(
          t.last_message_type,
          t.last_message_text,
          t.last_message_preview
        ).toLowerCase();
        return name.includes(q) || preview.includes(q);
      });
    }
    if (filter === "unread") {
      list = list.filter((t) => (unreadMap[String(t.conversation_id)] ?? 0) > 0);
    }
    if (filter === "archived") {
      list = [];
    }
    return list;
  }, [threads, searchQuery, filter, unreadMap]);

  const header = showHeader && (
    <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-200">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h1 className="text-lg font-semibold m-0 tracking-tight text-gray-900 truncate">Poruke</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
              aria-haspopup="menu"
              aria-expanded={filterOpen}
              aria-label="Filter"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
            {filterOpen && (
              <div
                className="absolute top-full right-0 mt-1 py-1 rounded-lg border border-gray-200 bg-white shadow-lg z-10 min-w-[140px]"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                  onClick={() => { setFilter("all"); setFilterOpen(false); }}
                >
                  All
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                  onClick={() => { setFilter("unread"); setFilterOpen(false); }}
                >
                  Unread
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-500"
                  onClick={() => { setFilter("archived"); setFilterOpen(false); }}
                >
                  Archived
                </button>
              </div>
            )}
          </div>
          {onNewClick && (
            <button
              type="button"
              onClick={onNewClick}
              className="py-1.5 px-3 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
            >
              + Nova
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (isInitialLoading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 px-4 py-4 space-y-3" style={{ background: "#f5f6f8" }}>
        {header}
        <div className="h-9 rounded-lg bg-gray-200/80 animate-pulse" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-200/80 animate-pulse min-w-0">
            <div className="w-10 h-10 rounded-full bg-gray-300/80 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-4 w-3/4 rounded bg-gray-300/80 mb-2" />
              <div className="h-3 w-1/2 rounded bg-gray-200/80" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col flex-1 min-h-0 px-4 py-4" style={{ background: "#f5f6f8" }}>
        {header}
        <div className="p-4 text-red-600 text-sm">
          <p className="m-0">Greška pri učitavanju poruka.</p>
          {DEV && (
            <p className="mt-2 text-xs font-mono text-gray-500">
              {fetchError.code} — {fetchError.message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: "#f5f6f8" }}>
      {header}
      {isRefreshing && (
        <div className="flex-shrink-0 px-4 py-1 text-xs text-gray-500 flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden />
          Osvežavam…
        </div>
      )}
      <div className="flex-shrink-0 px-4 py-3">
        <input
          type="search"
          placeholder="Pretraži razgovore..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full min-w-0 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          aria-label="Pretraži razgovore"
        />
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">
        {filteredThreads.length === 0 ? (
          <div className="py-4 text-gray-600 text-sm text-center">
            {threads.length === 0 ? "Nema razgovora." : "Nema rezultata za ovaj filter ili pretragu."}
          </div>
        ) : (
          <div className="flex flex-col space-y-3">
            {filteredThreads.map((t) => {
              const cid = String(t.conversation_id);
              const active = selectedId === cid;
              const unread = unreadMap[cid] ?? 0;
              const showUnread = unread > 0;
              const displayName =
                (otherParticipantNames[cid] ??
                  (t.other_user_name ?? t.other_name ?? t.title ?? "").trim() ??
                  "") || "Korisnik";
              const previewText = getSubtitlePreview(
                t.last_message_type,
                t.last_message_text,
                t.last_message_preview
              );
              const initials = getInitials(displayName);

              return (
                <Link
                  key={cid}
                  href={`/inbox/${cid}`}
                  className={`flex items-start gap-3 p-3 rounded-lg no-underline transition-colors min-w-0 ${
                    active
                      ? "bg-[var(--accent)]/10 border border-[var(--accent)]/30"
                      : "hover:bg-gray-200/80 border border-transparent"
                  }`}
                  onClick={() => {
                    inboxContext?.setClearedReadId(cid);
                    if (DEV) console.debug("[inbox] thread clicked", { conversationId: cid });
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold bg-gray-300 text-gray-700"
                    aria-hidden
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span
                        className={`text-sm truncate block min-w-0 font-medium text-gray-900 ${showUnread ? "font-bold" : ""}`}
                      >
                        {displayName}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {t.last_message_at ? relativeTime(t.last_message_at) : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0">
                      <p className="text-sm text-gray-600 truncate m-0 flex-1 min-w-0">
                        {previewText}
                      </p>
                      {showUnread && (
                        <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-[var(--accent)] text-white text-xs font-semibold flex items-center justify-center">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
