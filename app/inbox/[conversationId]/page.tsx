"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { relativeTime } from "@/src/lib/time";
import {
  isValidConversationId,
  getMessageTypeFromMime,
  sanitizeFilename,
} from "@/src/lib/messagingTypes";
import ReportModal from "../../components/ReportModal";
import InboxSidebar from "../InboxSidebar";
import Card from "../../components/ui/Card";
import Textarea from "../../components/ui/Textarea";
import Button from "../../components/ui/Button";

const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";
const SIGNED_URL_EXPIRY_SEC = 3600;

type Message = {
  id: string | number;
  text: string | null;
  sender_id: string;
  created_at: string;
  message_type?: string | null;
  attachment_bucket?: string | null;
  attachment_path?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  attachment_meta?: { originalName?: string } | null;
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

const MESSAGE_SELECT =
  "id, sender_id, text, message_type, attachment_bucket, attachment_path, attachment_mime, attachment_size, attachment_meta, created_at";

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

function signedUrlCacheKey(bucket: string, path: string): string {
  return `${bucket}:${path}`;
}

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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inboxRefreshTrigger, setInboxRefreshTrigger] = useState(0);

  const markAsRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);
  }, [user, conversationId]);

  // Resolve signed URLs for messages that have attachment_path; cache in state
  useEffect(() => {
    const needed: { bucket: string; path: string }[] = [];
    const seen = new Set<string>();
    for (const m of messages) {
      const path = m.attachment_path;
      if (!path || !m.attachment_bucket) continue;
      const key = signedUrlCacheKey(m.attachment_bucket, path);
      if (seen.has(key) || signedUrls[key]) continue;
      seen.add(key);
      needed.push({ bucket: m.attachment_bucket, path });
    }
    if (needed.length === 0) return;
    let cancelled = false;
    const updates: Record<string, string> = {};
    (async () => {
      for (const { bucket, path } of needed) {
        if (cancelled) return;
        const { data } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);
        if (cancelled) return;
        if (data?.signedUrl)
          updates[signedUrlCacheKey(bucket, path)] = data.signedUrl;
      }
      if (Object.keys(updates).length > 0 && !cancelled)
        setSignedUrls((prev) => ({ ...prev, ...updates }));
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, signedUrls]);

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
          ? (obj: Record<string, unknown>) =>
              console.log("[inbox conversation]", obj)
          : () => {};

      devLog({ routeParam: "conversationId", value: conversationId });

      const {
        data: { user: authUser },
        error: authErr,
      } = await supabase.auth.getUser();
      const authUid = authUser?.id ?? null;
      const authEmail = authUser?.email ?? null;
      devLog({
        auth: { uid: authUid, email: authEmail, error: authErr?.message },
      });

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
            ? {
                code: participantErr.code,
                message: participantErr.message,
                details: (participantErr as { details?: string })?.details,
              }
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
            ? {
                code: convErr.code,
                message: convErr.message,
                details: (convErr as { details?: string })?.details,
              }
            : null,
        },
      });

      const msgRes = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      const msgRows = (msgRes.data as Message[] | null) ?? [];
      const msgErr = msgRes.error;
      devLog({
        messagesFetch: {
          count: msgRows.length,
          error: msgErr
            ? {
                code: msgErr.code,
                message: msgErr.message,
                details: (msgErr as { details?: string })?.details,
              }
            : null,
        },
      });

      const hasParticipantRow = !!participantRow;
      const hasConvData = !!convData;
      const convErrCode = convErr?.code ?? null;
      const convErrMessage = convErr?.message ?? null;
      const isPermissionDenied =
        convErrCode === "42501" ||
        (convErrMessage?.toLowerCase().includes("permission denied") ?? false);

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
      // Mark as read as soon as we know we have access (read receipt)
      const { data: readRow, error: readErr } = await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", uid)
        .select("conversation_id, user_id, last_read_at")
        .maybeSingle();
      if (process.env.NODE_ENV === "development") {
        console.debug("[mark-read]", { conversationId, uid, readRow, readErr: readErr ? { message: readErr.message, code: readErr.code } : null });
      }
      if (!readErr && readRow) setInboxRefreshTrigger((t) => t + 1);

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
        const ct = contractData as {
          client_id: string;
          freelancer_id: string;
          jobs: unknown;
        } | null;
        if (ct) {
          otherUserId =
            ct.client_id === uid ? ct.freelancer_id : ct.client_id;
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
    }
    load();
  }, [user?.id, conversationId, markAsRead]);

  useEffect(() => {
    if (accessDenied && user) {
      router.replace("/inbox?new=1");
    }
  }, [accessDenied, user, router]);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const loadMore = async () => {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    const oldest = messages[0];
    const { data } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    const older = ((data as Message[]) ?? []).reverse();
    setMessages((prev) => [...older, ...prev]);
    setHasMore(older.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
    e.target.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !conversationId || profile?.deactivated) return;
    const hasText = text.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if (!hasText && !hasFiles) return;
    if (hasText && text.length > MAX_MESSAGE_LENGTH) {
      setError("Poruka može imati najviše 2000 karaktera.");
      return;
    }
    setError("");

    const senderId = user.id;

    if (hasFiles) {
      setUploading(true);
      let caption = hasText ? text.trim() : null;
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        const messageType = getMessageTypeFromMime(file.type);
        const sanitized = sanitizeFilename(file.name);
        const path = `conversation/${conversationId}/${crypto.randomUUID()}-${sanitized}`;

        const { error: uploadErr } = await supabase.storage
          .from(CHAT_ATTACHMENTS_BUCKET)
          .upload(path, file, { contentType: file.type || undefined, upsert: false });

        if (uploadErr) {
          setError(uploadErr.message);
          setUploading(false);
          return;
        }

        const payload = {
          conversation_id: conversationId,
          sender_id: senderId,
          text: i === 0 ? caption : null,
          message_type: messageType,
          attachment_bucket: CHAT_ATTACHMENTS_BUCKET,
          attachment_path: path,
          attachment_mime: file.type,
          attachment_size: file.size,
          attachment_meta: { originalName: file.name },
        };

        const optimisticId = `pending-${Date.now()}-${i}`;
        setMessages((prev) => [
          ...prev,
          {
            id: optimisticId,
            sender_id: senderId,
            text: i === 0 ? caption : null,
            created_at: new Date().toISOString(),
            message_type: messageType,
            attachment_bucket: CHAT_ATTACHMENTS_BUCKET,
            attachment_path: path,
            attachment_mime: file.type,
            attachment_size: file.size,
            attachment_meta: { originalName: file.name },
          },
        ]);

        const { data: inserted, error: insertErr } = await supabase
          .from("messages")
          .insert(payload)
          .select(MESSAGE_SELECT)
          .single();

        if (insertErr) {
          setError(insertErr.message);
          supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).remove([path]);
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          setUploading(false);
          setPendingFiles([]);
          return;
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? (inserted as Message) : m))
        );
      }
      setPendingFiles([]);
      setText("");
      setUploading(false);
      return;
    }

    setSending(true);
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[inbox send] conversation_id:",
        conversationId,
        "sender_id from auth:",
        senderId
      );
    }

    const optimisticId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        sender_id: senderId,
        text: text.trim(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { data: inserted, error: err } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        text: text.trim(),
      })
      .select(MESSAGE_SELECT)
      .single();

    setSending(false);
    if (err) {
      setError(err.message);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === optimisticId ? (inserted as Message) : m))
    );
    setText("");
  };

  const getSignedUrl = (m: Message): string | null => {
    if (!m.attachment_bucket || !m.attachment_path) return null;
    return signedUrls[signedUrlCacheKey(m.attachment_bucket, m.attachment_path)] ?? null;
  };

  const renderAttachment = (m: Message) => {
    const url = getSignedUrl(m);
    const type = (m.message_type || "file") as "image" | "video" | "audio" | "file";
    const name =
      (m.attachment_meta?.originalName as string) || "file";

    if (!url) {
      return (
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          Učitavanje…
        </span>
      );
    }

    switch (type) {
      case "image":
        return (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={url}
              alt={name}
              style={{
                maxWidth: "100%",
                maxHeight: 280,
                borderRadius: "var(--radius-sm)",
                objectFit: "contain",
              }}
            />
          </a>
        );
      case "video":
        return (
          <video
            controls
            src={url}
            style={{ maxWidth: "100%", maxHeight: 280, borderRadius: "var(--radius-sm)" }}
          />
        );
      case "audio":
        return (
          <audio controls src={url} style={{ maxWidth: "100%" }} />
        );
      default:
        return (
          <div style={{ marginTop: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{name}</span>
            {" · "}
            <a href={url} download={name} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
              Preuzmi
            </a>
          </div>
        );
    }
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
      } else if (
        debugInfo.participantRowYesNo &&
        !debugInfo.convDataYesNo
      ) {
        message =
          "Greška sheme/upita: učesnik postoji, razgovor nije učitan.";
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
            <div>
              <strong>Debug (dev)</strong>
            </div>
            <div>conversationId: {debugInfo.conversationId}</div>
            <div>auth uid: {debugInfo.authUid ?? "—"}</div>
            <div>convData: {debugInfo.convDataYesNo ? "yes" : "no"}</div>
            <div>
              convErr: {debugInfo.convErrCode ?? "—"}{" "}
              {debugInfo.convErrMessage ?? ""}
            </div>
            <div>participantRow: {debugInfo.participantRowYesNo ? "yes" : "no"}</div>
            <div>messages count: {debugInfo.messagesCount}</div>
          </div>
        )}
      </div>
    );
  }

  const canSend =
    (text.trim().length > 0 || pendingFiles.length > 0) &&
    !sending &&
    !uploading &&
    !profile?.deactivated;

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
          <InboxSidebar key={user?.id ?? "anon"} selectedId={conversationId} refreshTrigger={inboxRefreshTrigger} />
        </div>

        <Card
          style={{
            display: "flex",
            flexDirection: "column",
            padding: 0,
            overflow: "hidden",
          }}
        >
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
              const isPending = String(m.id).startsWith("pending-");
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
                  {m.attachment_path ? (
                    <>
                      {renderAttachment(m)}
                      {m.text && (
                        <p
                          style={{
                            margin: "8px 0 0",
                            fontSize: 14,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {m.text}
                        </p>
                      )}
                    </>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.text || (isPending ? "Šaljem…" : "")}
                    </p>
                  )}
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

          <form
            onSubmit={handleSend}
            style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--border)",
            }}
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

            {pendingFiles.length > 0 && (
              <div
                style={{
                  marginBottom: 8,
                  padding: 8,
                  background: "var(--panel2)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                  Prilog ({pendingFiles.length}):
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                  {pendingFiles.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ flex: 1, wordBreak: "break-all" }}>
                        {f.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(i)}
                        style={{
                          padding: "2px 8px",
                          fontSize: 12,
                          color: "var(--danger)",
                          background: "none",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                        }}
                      >
                        Ukloni
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={
                profile?.deactivated
                  ? "Nalog je deaktiviran"
                  : "Napiši poruku ili priloži fajl..."
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
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!!profile?.deactivated || uploading}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ padding: "6px 12px", fontSize: 13 }}
                >
                  Priloži
                </Button>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {text.length} / {MAX_MESSAGE_LENGTH}
                </span>
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={!canSend}
              >
                {uploading
                  ? "Šaljem prilog…"
                  : sending
                    ? "Šaljem…"
                    : "Pošalji"}
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
          <div>
            <strong>Debug (dev)</strong>
          </div>
          <div>conversationId: {debugInfo.conversationId}</div>
          <div>auth uid: {debugInfo.authUid ?? "—"}</div>
          <div>convData: {debugInfo.convDataYesNo ? "yes" : "no"}</div>
          <div>
            convErr: {debugInfo.convErrCode ?? "—"}{" "}
            {debugInfo.convErrMessage ?? ""}
          </div>
          <div>participantRow: {debugInfo.participantRowYesNo ? "yes" : "no"}</div>
          <div>messages count: {debugInfo.messagesCount}</div>
        </div>
      )}
    </>
  );
}
