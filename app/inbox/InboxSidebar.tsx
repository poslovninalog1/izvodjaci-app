"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { relativeTime } from "@/src/lib/time";
import Card from "../components/ui/Card";

export type InboxThread = {
  conversation_id: string | number;
  title: string | null;
  other_user_name?: string | null;
  username?: string | null;
  last_message_at: string | null;
  last_message_preview?: string | null;
  last_message_type?: string | null;
  unread_count: number;
};

function previewLabel(type: string | null | undefined): string {
  if (!type) return "📎 Fajl";
  switch (type) {
    case "image": return "📷 Slika";
    case "video": return "🎥 Video";
    case "audio": return "🎵 Audio";
    default: return "📎 Fajl";
  }
}

type Props = { selectedId?: string; refreshTrigger?: number; clearedReadId?: string | null };

type ParticipantRow = {
  conversation_id: number;
  user_id: string;
  profiles: { full_name: string | null } | null;
};

export default function InboxSidebar({ selectedId, refreshTrigger, clearedReadId }: Props) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [namesByConversation, setNamesByConversation] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<{ message: string; code?: string } | null>(null);
  const uid = user?.id ?? null;

  useEffect(() => {
    if (!uid) return;
    setThreads([]);
    setNamesByConversation({});
    setLoading(true);
    setFetchError(null);

    async function load() {
      const { data, error } = await supabase
        .from("v_inbox_threads")
        .select("conversation_id, title, other_user_name, last_message_at, last_message_preview, last_message_type, unread_count")
        .eq("user_id", uid)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (process.env.NODE_ENV === "development" && data?.length) {
        const first = data[0] as Record<string, unknown>;
        console.debug("[inbox threads] first thread all fields", first);
      }

      if (error) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[inbox threads] fetch error", { code: error.code, message: error.message, details: error.details, hint: (error as { hint?: string }).hint });
        }
        setFetchError({ message: error.message, code: error.code });
        setThreads([]);
        setLoading(false);
        return;
      }

      const list = (data as InboxThread[]) ?? [];
      setFetchError(null);
      setThreads(list);
      setLoading(false);

      if (list.length === 0) return;

      const conversationIds = list.map((t) => t.conversation_id);
      const { data: participantData } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id, profiles(full_name)")
        .in("conversation_id", conversationIds)
        .neq("user_id", uid);

      const map: Record<string, string> = {};
      (participantData as ParticipantRow[] | null)?.forEach((row) => {
        const key = String(row.conversation_id);
        const raw = row.profiles?.full_name;
        const value = (raw != null && String(raw).trim() !== "") ? String(raw).trim() : "Korisnik";
        map[key] = value;
        if (process.env.NODE_ENV === "development") {
          console.debug("[inbox sidebar] resolved name", { conversation_id: key, resolvedName: value });
        }
      });
      setNamesByConversation(map);
    }

    load();
  }, [uid, refreshTrigger]);

  // Optimistički: nakon mark-as-read postavi unread_count=0 za taj conversationId.
  useEffect(() => {
    if (!clearedReadId) return;
    setThreads((prev) => {
      const next = prev.map((t) =>
        String(t.conversation_id) === clearedReadId ? { ...t, unread_count: 0 } : t
      );
      if (process.env.NODE_ENV === "development") {
        console.debug("[threads] unread_count optimistically set to 0 for", clearedReadId);
      }
      return next;
    });
  }, [clearedReadId]);

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Učitavanje...</p>;
  }

  if (fetchError) {
    return (
      <Card>
        <p style={{ margin: 0, color: "var(--danger)" }}>Greška pri učitavanju inbox-a.</p>
        {process.env.NODE_ENV === "development" && (
          <p style={{ margin: "8px 0 0", fontSize: 12, fontFamily: "monospace", color: "var(--muted)" }}>
            {fetchError.code} — {fetchError.message}
          </p>
        )}
      </Card>
    );
  }

  if (threads.length === 0) {
    return (
      <Card>
        <p style={{ margin: 0, color: "var(--muted)" }}>Nema razgovora.</p>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {threads.map((t) => {
        const cid = String(t.conversation_id);
        const active = selectedId === cid;
        const unread = (t.unread_count ?? 0) > 0;
        const previewText =
          t.last_message_preview != null && String(t.last_message_preview).trim() !== ""
            ? String(t.last_message_preview).length > 60
              ? String(t.last_message_preview).slice(0, 60) + "…"
              : String(t.last_message_preview)
            : previewLabel(t.last_message_type);

        return (
          <Link
            key={cid}
            href={`/inbox/${cid}`}
            style={{ textDecoration: "none" }}
          >
            <Card
              style={{
                padding: "12px 16px",
                borderColor: active ? "var(--accent)" : undefined,
                background: active ? "rgba(220,38,38,0.04)" : undefined,
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              {/* Prva linija: title preko cijele širine, desno timestamp */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: unread ? 700 : 500,
                    color: "var(--text)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {namesByConversation[cid] || "Korisnik"}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {t.last_message_at ? relativeTime(t.last_message_at) : "—"}
                </span>
              </div>
              {/* Druga linija: preview + unread badge desno (samo ako unread_count > 0) */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "var(--muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {previewText}
                </p>
                {unread && (
                  <span
                    style={{
                      background: "var(--accent)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "1px 7px",
                      borderRadius: 10,
                      lineHeight: "18px",
                      flexShrink: 0,
                    }}
                  >
                    {t.unread_count}
                  </span>
                )}
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
