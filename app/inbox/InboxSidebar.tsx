"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { relativeTime } from "@/src/lib/time";
import Card from "../components/ui/Card";

type ConversationItem = {
  id: string;
  type: string;
  contract_id: number | null;
  pair_key: string | null;
  created_at: string;
  otherUserName: string;
  jobTitle: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

type Props = { selectedId?: string };

export default function InboxSidebar({ selectedId }: Props) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const uid = user.id;

    setConversations([]);
    setLoading(true);

    async function load() {
      if (process.env.NODE_ENV === "development") {
        console.log("[inbox sidebar] auth uid:", uid);
      }
      // Membership-only: conversation_ids from conversation_participants where user_id = auth.uid() only.
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", uid);

      if (!parts || parts.length === 0) {
        if (process.env.NODE_ENV === "development") {
          console.log("[inbox sidebar] fetched conversation_ids: (none)");
        }
        setConversations([]);
        setLoading(false);
        return;
      }

      const convIds = parts.map(
        (p: { conversation_id: string | number }) => String(p.conversation_id)
      );
      if (process.env.NODE_ENV === "development") {
        console.log("[inbox sidebar] fetched conversation_ids from conversation_participants:", convIds);
      }
      const lastReadMap: Record<string, string> = {};
      parts.forEach(
        (p: { conversation_id: string | number; last_read_at: string }) => {
          lastReadMap[String(p.conversation_id)] = p.last_read_at;
        }
      );

      // Load conversations where id IN those ids only (no other source).
      const { data: convos } = await supabase
        .from("conversations")
        .select("id, type, contract_id, pair_key, created_at")
        .in("id", convIds);

      if (!convos) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const otherUserIds = new Set<string>();
      const contractParticipants: Record<string, string> = {};
      const contractJobTitles: Record<string, string | null> = {};
      const contractIdsToFetch: number[] = [];

      convos.forEach((c: Record<string, unknown>) => {
        if (c.type === "direct" && c.pair_key) {
          const [a, b] = (c.pair_key as string).split(":");
          otherUserIds.add(a === uid ? b : a);
        } else if (c.type === "contract" && c.contract_id != null) {
          contractIdsToFetch.push(c.contract_id as number);
        }
      });

      if (contractIdsToFetch.length > 0) {
        const uniqueContractIds = [...new Set(contractIdsToFetch)];
        const { data: contractRows } = await supabase
          .from("contracts")
          .select("id, client_id, freelancer_id, jobs(title)")
          .in("id", uniqueContractIds);
        (contractRows ?? []).forEach((ct: Record<string, unknown>) => {
          const clientId = ct.client_id as string;
          const freelancerId = ct.freelancer_id as string;
          const otherId = clientId === uid ? freelancerId : clientId;
          const jobs = ct.jobs;
          const job = Array.isArray(jobs) ? jobs[0] : jobs;
          const jobTitle = (job as { title?: string })?.title ?? null;
          otherUserIds.add(otherId);
          convos
            .filter((c: Record<string, unknown>) => c.contract_id === ct.id)
            .forEach((c: Record<string, unknown>) => {
              const cid = String(c.id);
              contractParticipants[cid] = otherId;
              contractJobTitles[cid] = jobTitle;
            });
        });
      }

      const profileIds = [...otherUserIds];
      let profileMap: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", profileIds);
        (profiles ?? []).forEach(
          (p: { id: string; full_name: string | null }) => {
            profileMap[p.id] = p.full_name ?? "—";
          }
        );
      }

      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id, text, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false });

      const lastMsgMap: Record<
        string,
        { text: string; created_at: string }
      > = {};
      (msgs ?? []).forEach(
        (m: {
          conversation_id: string | number;
          text: string;
          created_at: string;
        }) => {
          const cid = String(m.conversation_id);
          if (!lastMsgMap[cid]) {
            lastMsgMap[cid] = {
              text: m.text,
              created_at: m.created_at,
            };
          }
        }
      );

      const { data: unreads } = await supabase.rpc("get_unread_counts");
      const unreadMap: Record<string, number> = {};
      (
        (unreads as { conversation_id: string; unread_count: number }[]) ?? []
      ).forEach((u) => {
        unreadMap[String(u.conversation_id)] = Number(u.unread_count);
      });

      const items: ConversationItem[] = convos.map(
        (c: Record<string, unknown>) => {
          let otherName = "—";
          let jobTitle: string | null = null;
          const cid = String(c.id);

          if (c.type === "direct" && c.pair_key) {
            const [a, b] = (c.pair_key as string).split(":");
            const otherId = a === uid ? b : a;
            otherName = profileMap[otherId] ?? "—";
          } else if (c.type === "contract") {
            const otherId = contractParticipants[cid];
            if (otherId) otherName = profileMap[otherId] ?? "—";
            jobTitle = contractJobTitles[cid] ?? null;
          }

          return {
            id: cid,
            type: c.type as string,
            contract_id: c.contract_id as number | null,
            pair_key: c.pair_key as string | null,
            created_at: c.created_at as string,
            otherUserName: otherName,
            jobTitle,
            lastMessageText: lastMsgMap[cid]?.text ?? null,
            lastMessageAt: lastMsgMap[cid]?.created_at ?? null,
            unreadCount: unreadMap[cid] ?? 0,
          };
        }
      );

      items.sort((a, b) => {
        const ta = a.lastMessageAt ?? a.created_at;
        const tb = b.lastMessageAt ?? b.created_at;
        return new Date(tb).getTime() - new Date(ta).getTime();
      });

      setConversations(items);
      setLoading(false);
      if (process.env.NODE_ENV === "development") {
        const renderedIds = items.map((i) => i.id);
        console.log("[inbox sidebar] final rendered conversation IDs (links use only these):", renderedIds);
      }
    }

    load();
  }, [user?.id]);

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Učitavanje...</p>;
  }

  if (conversations.length === 0) {
    return (
      <Card>
        <p style={{ margin: 0, color: "var(--muted)" }}>Nema razgovora.</p>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {conversations.map((c) => {
        const active = selectedId === c.id;
        const snippet = c.lastMessageText
          ? c.lastMessageText.length > 60
            ? c.lastMessageText.slice(0, 60) + "…"
            : c.lastMessageText
          : null;

        return (
          <Link
            key={c.id}
            href={`/inbox/${c.id}`}
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: c.unreadCount > 0 ? 700 : 500,
                        color: "var(--text)",
                      }}
                    >
                      {c.otherUserName}
                    </span>
                    {c.unreadCount > 0 && (
                      <span
                        style={{
                          background: "var(--accent)",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "1px 7px",
                          borderRadius: 10,
                          lineHeight: "18px",
                        }}
                      >
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  {c.jobTitle && (
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: 12,
                        color: "var(--accent)",
                      }}
                    >
                      {c.jobTitle}
                    </p>
                  )}
                  {snippet && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: "var(--muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {snippet}
                    </p>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {c.lastMessageAt
                    ? relativeTime(c.lastMessageAt)
                    : c.created_at
                      ? relativeTime(c.created_at)
                      : "—"}
                </span>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
