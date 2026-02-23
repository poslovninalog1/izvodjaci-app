"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { relativeTime } from "@/src/lib/time";
import { isValidConversationId } from "@/src/lib/messagingTypes";
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

type DebugInfo = {
  conversationId: string;
  authUid: string | null;
  authEmail: string | null;
  authErr: string | null;
  convDataYesNo: boolean;
  convErrCode: string | null;
  convErrMessage: string | null;
  participantRowYesNo: boolean;
  messagesCount: number;
};

export default function InboxChatPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const rawId = (params.conversationId as string) ?? "";
  const conversationId = isValidConversationId(rawId) ? rawId : "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
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
      const devLog =
        process.env.NODE_ENV === "development"
          ? (obj: Record<string, unknown>) => console.log("[inbox conversation]", obj)
          : () => {};

      devLog({ routeParam: "conversationId", value: conversationId });

      const {
        data: { user: authUser },
        error: authErr,
      } = await supabase.auth.getUser();
      const authUid = authUser?.id ?? null;
      const authEmail = authUser?.email ?? null;
      devLog({ auth: { uid: authUid, email: authEmail, error: authErr?.message } });

      const participantRes = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", uid)
        .maybeSingle();
      const participantRow = participantRes.data;
      const participantErr = participantRes.error;
      devLog({
        participantCheck: {
          data: participantRow,
          error: participantErr
            ? { code: participantErr.code, message: participantErr.message, details: (participantErr as { details?: string })?.details }
            : null,
        },
      });

      const convRes = await supabase
        .from("conversations")
        .select("id, type, pair_key, contract_id, created_at")
        .eq("id", conversationId)
        .maybeSingle();
      const convData = convRes.data;
      const convErr = convRes.error;
      devLog({
        conversationFetch: {
          data: convData,
          error: convErr
            ? { code: convErr.code, message: convErr.message, details: (convErr as { details?: string })?.details }
            : null,
        },
      });

      const msgRes = await supabase
        .from("messages")
        .select("id, text, sender_id, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      const msgRows = (msgRes.data as Message[] | null) ?? [];
      const msgErr = msgRes.error;
      devLog({
        messagesFetch: {
          count: msgRows.length,
          error: msgErr
            ? { code: msgErr.code, message: msgErr.message, details: (msgErr as { details?: string })?.details }
            : null,
        },
      });

      const hasParticipantRow = !!participantRow;
      const hasConvData = !!convData;
      const convErrCode = convErr?.code ?? null;
      const convErrMessage = convErr?.message ?? null;
      const isPermissionDenied =
        convErrCode === "42501" || (convErrMessage?.toLowerCase().includes("permission denied") ?? false);

      setDebugInfo({
        conversationId,
        authUid,
        authEmail,
        authErr: authErr?.message ?? null,
        convDataYesNo: hasConvData,
        convErrCode,
        convErrMessage,
        participantRowYesNo: hasParticipantRow,
        messagesCount: msgRows.length,
      });

      if (!authUid) {
        setAccessDenied(false);
        setMeta(null);
        setLoading(false);
        return;
      }
      if (hasParticipantRow && !hasConvData) {
        setAccessDenied(false);
        setMeta(null);
        setLoading(false);
        return;
      }
      if (!hasParticipantRow) {
        setAccessDenied(false);
        setMeta(null);
        setLoading(false);
        return;
      }
      if (convErr && isPermissionDenied) {
        setAccessDenied(true);
        setMeta(null);
        setLoading(false);
        return;
      }
      if (convErr || !convData) {
        setAccessDenied(false);
        setMeta(null);
        setLoading(false);
        return;
      }

      setAccessDenied(false);
      const c = convData as Record<string, unknown>;
      let otherUserName = "—";
      let jobTitle: string | null = null;
      let otherUserId: string | null = null;

      if (c.type === "direct" && c.pair_key) {
        const [a, b] = (c.pair_key as string).split(":");
        otherUserId = a === uid ? b : a;
      } else if (c.type === "contract" && c.contract_id != null) {
        const contractId = c.contract_id as number;
        const { data: contractData } = await supabase
          .from("contracts")
          .select("client_id, freelancer_id, jobs(title)")
          .eq("id", contractId)
          .maybeSingle();
        const ct = contractData as { client_id: string; freelancer_id: string; jobs: unknown } | null;
        if (ct) {
          otherUserId = ct.client_id === uid ? ct.freelancer_id : ct.client_id;
          const jobs = ct.jobs;
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
        otherUserName = (prof as { full_name?: string })?.full_name ?? "—";
      }

      setMeta({
        type: c.type as string,
        contract_id: c.contract_id as number | null,
        pair_key: c.pair_key as string | null,
        otherUserName,
        jobTitle,
      });

      const loaded = [...msgRows].reverse();
      setMessages(loaded);
      setHasMore(msgRows.length >= PAGE_SIZE);
      setLoading(false);
      markAsRead();
    }
    load();
  }, [user?.id, conversationId, markAsRead]);

  // When access is denied (conversation belongs to another account), redirect immediately so the user never sees that screen.
  useEffect(() => {
    if (accessDenied && user) {
      router.replace("/inbox?new=1");
    }
  }, [accessDenied, user, router]);

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
    if (!user || !conversationId || !text.trim() || sending || profile?.deactivated) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setError("Poruka može imati najviše 2000 karaktera.");
      return;
    }
    setError("");
    setSending(true);

    const senderId = user.id;
    if (process.env.NODE_ENV === "development") {
      console.log("[inbox send] conversation_id:", conversationId, "sender_id from auth:", senderId);
    }
    const { error: err } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: senderId,
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

  if (!conversationId) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ marginBottom: 12 }}>Neispravan ID razgovora.</p>
        <Link href="/inbox" style={{ color: "var(--accent)" }}>
          ← Nazad na Inbox
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>Učitavanje razgovora...</p>
      </div>
    );
  }

  if (!meta) {
    let message = "Razgovor nije pronađen.";
    let linkHref = "/inbox";
    let linkText = "← Nazad na Inbox";
    if (debugInfo) {
      if (!debugInfo.authUid) {
        message = "Nisi ulogovan.";
      } else if (debugInfo.participantRowYesNo && !debugInfo.convDataYesNo) {
        message = "Greška sheme/upita: učesnik postoji, razgovor nije učitan.";
      } else if (!debugInfo.participantRowYesNo) {
        message = "Nisi učesnik ovog razgovora.";
        linkHref = "/inbox?new=1";
        linkText = "← Započni novi razgovor";
      } else if (accessDenied) {
        message = "Nemaš pristup ovom razgovoru.";
        linkHref = "/inbox?new=1";
        linkText = "← Započni novi razgovor";
      }
    } else if (accessDenied) {
      message = "Nemaš pristup ovom razgovoru.";
      linkHref = "/inbox?new=1";
      linkText = "← Započni novi razgovor";
    }

    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ marginBottom: 12 }}>{message}</p>
        <Link href={linkHref} style={{ color: "var(--accent)" }}>
          {linkText}
        </Link>
        {process.env.NODE_ENV === "development" && debugInfo && (
          <div
            style={{
              marginTop: 24,
              padding: 12,
              background: "var(--panel2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              fontFamily: "monospace",
            }}
          >
            <div><strong>Debug (dev)</strong></div>
            <div>conversationId: {debugInfo.conversationId}</div>
            <div>auth uid: {debugInfo.authUid ?? "—"}</div>
            <div>convData: {debugInfo.convDataYesNo ? "yes" : "no"}</div>
            <div>convErr: {debugInfo.convErrCode ?? "—"} {debugInfo.convErrMessage ?? ""}</div>
            <div>participantRow: {debugInfo.participantRowYesNo ? "yes" : "no"}</div>
            <div>messages count: {debugInfo.messagesCount}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
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
        <InboxSidebar key={user?.id ?? "anon"} selectedId={conversationId} />
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
    {process.env.NODE_ENV === "development" && debugInfo && (
      <div
        style={{
          maxWidth: 1000,
          margin: "24px auto 0",
          padding: 12,
          background: "var(--panel2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          fontSize: 12,
          fontFamily: "monospace",
        }}
      >
        <div><strong>Debug (dev)</strong></div>
        <div>conversationId: {debugInfo.conversationId}</div>
        <div>auth uid: {debugInfo.authUid ?? "—"}</div>
        <div>convData: {debugInfo.convDataYesNo ? "yes" : "no"}</div>
        <div>convErr: {debugInfo.convErrCode ?? "—"} {debugInfo.convErrMessage ?? ""}</div>
        <div>participantRow: {debugInfo.participantRowYesNo ? "yes" : "no"}</div>
        <div>messages count: {debugInfo.messagesCount}</div>
      </div>
    )}
    </>
  );
}
