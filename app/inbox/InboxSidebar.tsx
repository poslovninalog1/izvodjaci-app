"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../components/ui/Card";

type Conversation = {
  id: number;
  contract_id: number;
  created_at: string;
  contracts: {
    client_id: string;
    freelancer_id: string;
    jobs: unknown;
  } | unknown;
};

type Props = { selectedId?: number };

export default function InboxSidebar({ selectedId }: Props) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<number, { text: string; created_at: string }>>({});
  const [counterpartNames, setCounterpartNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    async function load() {
      const { data: convData, error: convErr } = await supabase
        .from("conversations")
        .select("id, contract_id, created_at, contracts(client_id, freelancer_id, jobs(title))")
        .order("created_at", { ascending: false });

      if (convErr) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const list = (convData ?? []) as Conversation[];
      const filtered = list.filter((c) => {
        const ct = (Array.isArray(c.contracts) ? c.contracts[0] : c.contracts) as { client_id?: string; freelancer_id?: string } | null;
        if (!ct) return false;
        return ct.client_id === uid || ct.freelancer_id === uid;
      });

      setConversations(filtered);

      const convIds = filtered.map((c) => c.id);
      if (convIds.length > 0) {
        const { data: msgData } = await supabase
          .from("messages")
          .select("conversation_id, text, created_at")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false });

        const latest: Record<number, { text: string; created_at: string }> = {};
        (msgData ?? []).forEach((m: { conversation_id: number; text: string; created_at: string }) => {
          if (!latest[m.conversation_id]) latest[m.conversation_id] = { text: m.text, created_at: m.created_at };
        });
        setLastMessages(latest);
      }

      const ids = [...new Set(filtered.flatMap((c) => {
        const ct = (Array.isArray(c.contracts) ? c.contracts[0] : c.contracts) as { client_id?: string; freelancer_id?: string } | null;
        if (!ct) return [];
        return [ct.client_id, ct.freelancer_id].filter((x): x is string => !!x && x !== uid);
      }))];
      if (ids.length > 0) {
        const { data: profData } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const map: Record<string, string> = {};
        (profData ?? []).forEach((p: { id: string; full_name: string | null }) => {
          map[p.id] = p.full_name ?? "—";
        });
        setCounterpartNames(map);
      }

      setLoading(false);
    }
    load();
  }, [user?.id]);

  const getJobTitle = (c: Conversation) => {
    const ct = (Array.isArray(c.contracts) ? c.contracts[0] : c.contracts) as { jobs?: unknown } | null;
    if (!ct?.jobs) return "—";
    const j = ct.jobs;
    if (Array.isArray(j)) return (j[0] as { title?: string })?.title ?? "—";
    return (j as { title?: string })?.title ?? "—";
  };

  const getCounterpartName = (c: Conversation) => {
    const ct = (Array.isArray(c.contracts) ? c.contracts[0] : c.contracts) as { client_id?: string; freelancer_id?: string } | null;
    if (!ct) return "—";
    const id = ct.client_id === user?.id ? ct.freelancer_id : ct.client_id;
    return id ? (counterpartNames[id] ?? "—") : "—";
  };

  if (loading) return <p style={{ color: "var(--muted)" }}>Učitavanje...</p>;
  if (conversations.length === 0) {
    return (
      <Card>
        <p style={{ margin: 0, color: "var(--muted)" }}>Nema razgovora.</p>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {conversations.map((c) => {
        const active = selectedId === c.id;
        return (
          <Link key={c.id} href={`/inbox/${c.id}`}>
            <Card
              style={{
                padding: 16,
                borderColor: active ? "var(--accent)" : undefined,
                background: active ? "var(--panel2)" : undefined,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <strong style={{ fontSize: 15 }}>{getJobTitle(c)}</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>{getCounterpartName(c)}</p>
                  {lastMessages[c.id] && (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                      {(lastMessages[c.id].text || "").slice(0, 50)}
                      {(lastMessages[c.id].text?.length ?? 0) > 50 ? "…" : ""}
                    </p>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {lastMessages[c.id]?.created_at
                    ? new Date(lastMessages[c.id].created_at).toLocaleDateString("sr-Latn")
                    : c.created_at
                      ? new Date(c.created_at).toLocaleDateString("sr-Latn")
                      : "—"}
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
