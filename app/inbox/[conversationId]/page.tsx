"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../../context/ToastContext";
import { relativeTime } from "@/src/lib/time";
import ReportModal from "../../components/ReportModal";
import InboxSidebar from "../InboxSidebar";
import Card from "../../components/ui/Card";
import Textarea from "../../components/ui/Textarea";
import Button from "../../components/ui/Button";

type Message = {
  id: string | number;
  text: string;
  sender_id: string;
  created_at: string;
};

type ConversationMeta = {
  type: string;
  contract_id: number | null;
  pair_key: string | null;
  otherUserName: string;
  jobTitle: string | null;
};

const MAX_MESSAGE_LENGTH = 2000;
const PAGE_SIZE = 50;

export default function InboxChatPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();
  const conversationId = (params.conversationId as string) ?? "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const markAsRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);
  }, [user, conversationId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/inbox/" + conversationId);
    }
  }, [user, authLoading, router, conversationId]);

  useEffect(() => {
    if (!user || !conversationId) return;
    const uid = user.id;

    async function load() {
      const { data: convData, error: convErr } = await supabase
        .from("conversations")
        .select(
          "id, type, contract_id, pair_key, contracts(client_id, freelancer_id, jobs(title))"
        )
        .eq("id", conversationId)
        .single();

      if (convErr || !convData) {
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.log("[inbox conversation] load err:", convErr?.message, "convId:", conversationId);
        }
        setMeta(null);
        setLoading(false);
        return;
      }

      const c = convData as Record<string, unknown>;
      let otherUserName = "—";
      let jobTitle: string | null = null;
      let otherUserId: string | null = null;

      if (c.type === "direct" && c.pair_key) {
        const [a, b] = (c.pair_key as string).split(":");
        otherUserId = a === uid ? b : a;
      } else if (c.type === "contract" && c.contracts) {
        const ct = Array.isArray(c.contracts)
          ? c.contracts[0]
          : c.contracts;
        if (ct) {
          const typed = ct as {
            client_id: string;
            freelancer_id: string;
            jobs: unknown;
          };
          otherUserId =
            typed.client_id === uid ? typed.freelancer_id : typed.client_id;
          const jobs = typed.jobs;
          const job = Array.isArray(jobs) ? jobs[0] : jobs;
          jobTitle = (job as { title?: string })?.title ?? null;
        }
      }

      if (otherUserId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", otherUserId)
          .single();
        otherUserName =
          (prof as { full_name?: string })?.full_name ?? "—";
      }

      setMeta({
        type: c.type as string,
        contract_id: c.contract_id as number | null,
        pair_key: c.pair_key as string | null,
        otherUserName,
        jobTitle,
      });

      const { data: msgData } = await supabase
        .from("messages")
        .select("id, text, sender_id, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      const loaded = ((msgData as Message[]) ?? []).reverse();
      setMessages(loaded);
      setHasMore(loaded.length === PAGE_SIZE);
      setLoading(false);

      markAsRead();
    }
    load();
  }, [user?.id, conversationId, markAsRead]);

  // Realtime subscription
  useEffect(() => {
    if (!user || !conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          markAsRead();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, conversationId, markAsRead]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const loadMore = async () => {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    const oldest = messages[0];
    const { data } = await supabase
      .from("messages")
      .select("id, text, sender_id, created_at")
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    const older = ((data as Message[]) ?? []).reverse();
    setMessages((prev) => [...older, ...prev]);
    setHasMore(older.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !text.trim() || sending || profile?.deactivated) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setError("Poruka može imati najviše 2000 karaktera.");
      return;
    }
    setError("");
    setSending(true);

    const { error: err } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      text: text.trim(),
    });

    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setText("");
  };

  if (authLoading || !user) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>Učitavanje...</p>
      </div>
    );
  }

  if (!loading && !meta) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p>Razgovor nije pronađen.</p>
        <Link href="/inbox" style={{ color: "var(--accent)" }}>
          ← Nazad na Inbox
        </Link>
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
        minHeight: "calc(100vh - 180px)",
      }}
    >
      <div>
        <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 600 }}>
          Inbox
        </h1>
        <InboxSidebar selectedId={conversationId} />
      </div>

      <Card
        style={{
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
              {meta?.otherUserName ?? "…"}
            </h2>
            {meta?.jobTitle && (
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 13,
                  color: "var(--muted)",
                }}
              >
                {meta.jobTitle}
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={() => setShowReport(true)}
            style={{ padding: "5px 10px", fontSize: 12 }}
          >
            Prijavi
          </Button>
        </div>

        {/* Messages */}
        <div
          ref={chatRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minHeight: 200,
          }}
        >
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              style={{
                alignSelf: "center",
                padding: "6px 16px",
                fontSize: 13,
                color: "var(--accent)",
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: loadingMore ? "wait" : "pointer",
                marginBottom: 8,
              }}
            >
              {loadingMore ? "Učitavam..." : "Starije poruke"}
            </button>
          )}

          {!loading && messages.length === 0 && (
            <p
              style={{
                color: "var(--muted)",
                textAlign: "center",
                margin: "auto 0",
                fontSize: 14,
              }}
            >
              Nema poruka. Započni razgovor!
            </p>
          )}

          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: mine ? "flex-end" : "flex-start",
                  maxWidth: "75%",
                  padding: "10px 14px",
                  borderRadius: mine
                    ? "var(--radius-sm) var(--radius-sm) 4px var(--radius-sm)"
                    : "var(--radius-sm) var(--radius-sm) var(--radius-sm) 4px",
                  background: mine
                    ? "rgba(220,38,38,0.08)"
                    : "var(--panel2)",
                  border: mine
                    ? "1px solid rgba(220,38,38,0.2)"
                    : "1px solid var(--border)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {m.text}
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 11,
                    color: "var(--muted)",
                    textAlign: mine ? "right" : "left",
                  }}
                >
                  {relativeTime(m.created_at)}
                </p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSend}
          style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}
        >
          {error && (
            <p
              style={{
                color: "var(--danger)",
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              {error}
            </p>
          )}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={
              profile?.deactivated
                ? "Nalog je deaktiviran"
                : "Napiši poruku..."
            }
            rows={2}
            disabled={!!profile?.deactivated}
            style={{ marginBottom: 8 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {text.length} / {MAX_MESSAGE_LENGTH}
            </span>
            <Button
              type="submit"
              variant="primary"
              disabled={
                sending || !text.trim() || !!profile?.deactivated
              }
            >
              {sending ? "Šaljem..." : "Pošalji"}
            </Button>
          </div>
        </form>
      </Card>

      {showReport && (
        <ReportModal
          targetType="message"
          targetId={String(conversationId)}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
