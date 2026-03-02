"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { relativeTime, messageDayLabel } from "@/src/lib/time";
import {
  isValidConversationId,
  getMessageTypeFromMime,
  sanitizeFilename,
} from "@/src/lib/messagingTypes";
import ReportModal from "../../components/ReportModal";
import { useInboxContext } from "../InboxContext";
import ParticipantDrawer from "../ParticipantDrawer";
import ParticipantPanel from "../ParticipantPanel";
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
  otherUserId: string | null;
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
  /** Set after mark-as-read: updated row or null if no row matched */
  markReadUpdatedRow: { conversation_id: string; user_id: string; last_read_at: string } | null;
  /** Set after mark-as-read: error if update failed */
  markReadError: { message: string; code?: string } | null;
};

function signedUrlCacheKey(bucket: string, path: string): string {
  return `${bucket}:${path}`;
}

/** Convert route param to number for bigint RPC; null if invalid (avoids "best candidate" error). */
function toConvIdNum(conversationId: string): number | null {
  const n = Number(conversationId);
  if (!Number.isFinite(n) || n !== Math.floor(n)) return null;
  return n;
}

export default function InboxChatPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const rawId = (params.conversationId as string) ?? "";
  const conversationId = isValidConversationId(rawId) ? rawId : "";
  const convIdNum = conversationId ? toConvIdNum(conversationId) : null;
  const invalidConversationId = rawId !== "" && !conversationId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [isParticipantOpen, setParticipantOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastLoadedConversationIdRef = useRef<string | null>(null);
  const markReadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const inboxContext = useInboxContext();
  const inboxContextRef = useRef(inboxContext);
  inboxContextRef.current = inboxContext;
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});

  const DEV = process.env.NODE_ENV === "development";

  const markAsRead = useCallback(async () => {
    if (!user || convIdNum === null) return;
    const { data, error } = await supabase.rpc("mark_conversation_read", {
      p_conversation_id: convIdNum,
    });
    if (process.env.NODE_ENV === "development") {
      console.debug("[mark_read rpc]", { conversationId, convIdNum, data, error });
    }
    if (error) return;
    if (data != null) {
      inboxContextRef.current?.setClearedReadId(conversationId);
      inboxContextRef.current?.triggerRefresh();
    }
  }, [user, conversationId, convIdNum]);

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
    if (process.env.NODE_ENV === "development") console.count("ConversationPage mount");
    return () => {
      if (process.env.NODE_ENV === "development") console.count("ConversationPage unmount");
    };
  }, []);

  useEffect(() => {
    if (!user || !conversationId || convIdNum === null) {
      if (invalidConversationId) setLoading(false);
      return;
    }
    const uid = user.id;
    const currentConvId = conversationId;
    const currentConvIdNum = convIdNum;
    const rid = ++requestIdRef.current;
    const isInitialLoad = lastLoadedConversationIdRef.current !== currentConvId;

    if (DEV) console.time("inbox-convo-fetch");
    if (isInitialLoad) setLoading(true);
    else setIsRefreshing(true);

    async function load() {
      if (DEV) {
        console.debug("[inbox conversation] fetch start", { authUserId: uid, conversationId: currentConvId, requestId: rid });
      }

      const [participantRes, convRes, msgRes] = await Promise.all([
        supabase
          .from("conversation_participants")
          .select("conversation_id, user_id")
          .eq("conversation_id", currentConvId)
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("conversations")
          .select("id, type, pair_key, contract_id, created_at")
          .eq("id", currentConvId)
          .maybeSingle(),
        supabase
          .from("messages")
          .select(MESSAGE_SELECT)
          .eq("conversation_id", currentConvId)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE),
      ]);

      if (rid !== requestIdRef.current) {
        if (DEV) console.debug("[inbox conversation] stale result ignored", { requestId: rid });
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      const participantRow = participantRes.data;
      const convData = convRes.data;
      const convErr = convRes.error;
      const msgRows = (msgRes.data as Message[] | null) ?? [];

      if (DEV) {
        console.timeEnd("inbox-convo-fetch");
        console.debug("[inbox message fetch]", msgRows.length);
      }

      if (!participantRow) {
        setAccessDenied(false);
        setMeta(null);
        setMessages([]);
        setLoading(false);
        setIsRefreshing(false);
        lastLoadedConversationIdRef.current = null;
        return;
      }

      const hasConvData = !!convData;
      const convErrCode = convErr?.code ?? null;
      const convErrMessage = convErr?.message ?? null;
      const isPermissionDenied =
        convErrCode === "42501" ||
        (convErrMessage?.toLowerCase().includes("permission denied") ?? false);

      setDebugInfo({
        conversationId: currentConvId,
        authUid: uid,
        authEmail: null,
        authErr: null,
        convDataYesNo: hasConvData,
        convErrCode,
        convErrMessage,
        participantRowYesNo: true,
        messagesCount: msgRows.length,
        markReadUpdatedRow: null,
        markReadError: null,
      });

      if (convErr && isPermissionDenied) {
        setAccessDenied(true);
        setMeta(null);
        setMessages([]);
        setLoading(false);
        setIsRefreshing(false);
        lastLoadedConversationIdRef.current = null;
        return;
      }
      if (convErr || !convData) {
        setAccessDenied(false);
        setMeta(null);
        setMessages([]);
        setLoading(false);
        setIsRefreshing(false);
        lastLoadedConversationIdRef.current = null;
        return;
      }

      setAccessDenied(false);

      const { data: rpcData, error: readErr } = await supabase.rpc("mark_conversation_read", {
        p_conversation_id: currentConvIdNum,
      });
      if (DEV) {
        console.debug("[mark_read rpc]", {
          conversationId: currentConvId,
          convIdNum: currentConvIdNum,
          data: rpcData,
          error: readErr,
        });
      }
      const updated = !readErr && rpcData != null;
      setDebugInfo((prev) =>
        prev
          ? {
              ...prev,
              markReadUpdatedRow: updated
                ? {
                    conversation_id: currentConvId,
                    user_id: uid,
                    last_read_at:
                      (rpcData as { last_read_at?: string })?.last_read_at ?? new Date().toISOString(),
                  }
                : null,
              markReadError: readErr ? { message: readErr.message, code: readErr.code } : null,
            }
          : null
      );
      if (updated && inboxContextRef.current) {
        inboxContextRef.current.setClearedReadId(currentConvId);
        inboxContextRef.current.triggerRefresh();
      }

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

      if (currentConvId !== conversationId) return;

      setMeta({
        type: c.type as string,
        contract_id: c.contract_id as number | null,
        pair_key: c.pair_key as string | null,
        otherUserName,
        otherUserId,
        jobTitle,
      });

      const loaded = [...msgRows].reverse();
      setMessages(loaded);
      setHasMore(msgRows.length >= PAGE_SIZE);
      lastLoadedConversationIdRef.current = currentConvId;

      const senderIds = [...new Set(loaded.map((m) => m.sender_id).filter(Boolean))] as string[];
      if (senderIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", senderIds);
        const map: Record<string, string> = {};
        (profilesData ?? []).forEach((p: { id: string; full_name: string | null }) => {
          const name = p.full_name?.trim();
          map[p.id] = name ? name : `${p.id.slice(0, 8)}…`;
        });
        setSenderNames(map);
      }

      setLoading(false);
      setIsRefreshing(false);
    }
    load();
  }, [user?.id, conversationId, convIdNum, invalidConversationId]);

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
        async (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.sender_id) {
            const { data: p } = await supabase.from("profiles").select("id, full_name").eq("id", newMsg.sender_id).single();
            if (p) setSenderNames((prev) => ({ ...prev, [newMsg.sender_id]: (p as { full_name: string | null }).full_name?.trim() || `${newMsg.sender_id.slice(0, 8)}…` }));
          }
          if (markReadDebounceRef.current) clearTimeout(markReadDebounceRef.current);
          markReadDebounceRef.current = setTimeout(() => {
            markReadDebounceRef.current = null;
            markAsRead();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      if (markReadDebounceRef.current) clearTimeout(markReadDebounceRef.current);
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

  const canSend =
    (text.trim().length > 0 || pendingFiles.length > 0) &&
    !sending &&
    !uploading &&
    !profile?.deactivated;

  const isInitialLoading = loading && messages.length === 0;
  const showChatArea = !authLoading && user;
  const showInvalidId = showChatArea && invalidConversationId;
  const showNoAccess = showChatArea && !meta && !isInitialLoading && !showInvalidId;
  const showConversation = showChatArea && meta;

  return (
    <>
      {/* CENTER: Chat (layout slots this in grid col 2) */}
      <Card
        className="flex flex-col min-w-0 overflow-hidden h-full min-h-0 w-full border-0 shadow-none rounded-none bg-transparent"
        style={{ padding: 0 }}
      >
          {!showChatArea ? (
            <div className="flex-1 flex items-center justify-center min-h-[200px]">
              <p className="text-[var(--muted)] m-0">Učitavanje…</p>
            </div>
          ) : showInvalidId ? (
            <div className="flex-1 flex flex-col p-6 min-h-0">
              <p className="text-gray-700 mb-3">
                Neispravan ID razgovora. Izaberi razgovor sa liste.
              </p>
              <Link href="/inbox" className="text-[var(--accent)] hover:underline">
                ← Nazad na poruke
              </Link>
            </div>
          ) : showNoAccess ? (
            <div className="flex-1 flex flex-col p-6 min-h-0">
              <p className="text-gray-700 mb-3">
                {accessDenied ? "Not found or no access." : "Nema pristupa ili razgovor ne postoji."}
              </p>
              <Link href="/inbox?new=1" className="text-[var(--accent)] hover:underline mb-2">
                ← Započni novi razgovor
              </Link>
              {process.env.NODE_ENV === "development" && (
                <Button type="button" variant="secondary" onClick={() => setShowDebug((d) => !d)} style={{ alignSelf: "flex-start", fontSize: 12 }}>
                  {showDebug ? "Sakrij debug" : "Debug"}
                </Button>
              )}
            </div>
          ) : (
            /* Always render same structure when we have or are loading a conversation */
            <div className="flex flex-col h-full min-h-0 flex-1">
              {/* Header — shrink-0 */}
              <header
                className="shrink-0 px-4 py-3 border-b border-[var(--border)] flex justify-between items-center flex-wrap gap-2"
                style={{ minHeight: 52 }}
              >
                {!meta ? (
                  <>
                    <div className="h-5 w-[120px] rounded bg-gray-200 animate-pulse" />
                    <div className="h-4 w-16 rounded bg-gray-200 animate-pulse" />
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setParticipantOpen(true)}
                        className="w-full text-left rounded-lg py-1 pr-2 -ml-1 hover:bg-gray-50 transition-colors cursor-pointer border-0 bg-transparent"
                      >
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-gray-200 text-gray-700 shrink-0">
                            {(meta.otherUserName ?? "?").trim().charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h2 className="m-0 text-lg font-semibold text-gray-900 truncate">
                              {meta.otherUserName ?? "…"}
                            </h2>
                            {meta.jobTitle && (
                              <p className="mt-0.5 text-sm text-[var(--muted)] m-0 truncate">{meta.jobTitle}</p>
                            )}
                          </div>
                          {isRefreshing && (
                            <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden />
                              Osvežavam…
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {process.env.NODE_ENV === "development" && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setShowDebug((d) => !d)}
                          style={{ padding: "4px 8px", fontSize: 11 }}
                        >
                          {showDebug ? "Sakrij debug" : "Debug"}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => setShowReport(true)}
                        style={{ padding: "5px 10px", fontSize: 12 }}
                      >
                        Prijavi
                      </Button>
                    </div>
                  </>
                )}
              </header>

              {/* Message list — flex-1 min-h-0 so it scrolls */}
              <div
                ref={chatRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col p-4 gap-2"
                style={{ minHeight: 200 }}
              >
            {isInitialLoading ? (
              <div className="flex flex-col gap-3 py-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-11 rounded-lg bg-gray-200 animate-pulse"
                    style={{
                      width: i % 2 === 0 ? "70%" : "50%",
                      alignSelf: i % 2 === 0 ? "flex-end" : "flex-start",
                    }}
                  />
                ))}
              </div>
            ) : (
              <>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="self-center py-1.5 px-4 text-sm text-[var(--accent)] bg-transparent border border-[var(--border)] rounded-md cursor-pointer mb-2 disabled:opacity-50"
              >
                {loadingMore ? "Učitavam..." : "Starije poruke"}
              </button>
            )}

            {messages.length === 0 && (
              <p className="text-[var(--muted)] text-center my-4 text-sm">
                Nema poruka. Započni razgovor!
              </p>
            )}

            {messages.length > 0 && (() => {
              const groups: { label: string; messages: Message[] }[] = [];
              let currentLabel = "";
              messages.forEach((m) => {
                const label = messageDayLabel(m.created_at);
                if (label !== currentLabel) {
                  currentLabel = label;
                  groups.push({ label, messages: [m] });
                } else {
                  groups[groups.length - 1].messages.push(m);
                }
              });
              return groups.map((group, idx) => (
                <div key={`${group.label}-${group.messages[0]?.id ?? idx}`} className="flex flex-col gap-2">
                  <div className="flex justify-center py-2">
                    <span className="text-xs font-medium text-[var(--muted)] bg-[var(--panel2)] px-3 py-1 rounded-full">
                      {group.label}
                    </span>
                  </div>
                  {group.messages.map((m) => {
                    const mine = m.sender_id === user.id;
                    const isPending = String(m.id).startsWith("pending-");
                    const senderDisplay = senderNames[m.sender_id] ?? (m.sender_id ? `${m.sender_id.slice(0, 8)}…` : "—");
                    return (
                      <div
                        key={m.id}
                        className="flex flex-col max-w-[75%]"
                        style={{
                          alignSelf: mine ? "flex-end" : "flex-start",
                          alignItems: mine ? "flex-end" : "flex-start",
                        }}
                      >
                        <span className="text-[11px] text-[var(--muted)] mb-0.5">{senderDisplay}</span>
                        <div
                          className="px-3.5 py-2.5 rounded-lg"
                          style={{
                            borderRadius: mine
                              ? "var(--radius-sm) var(--radius-sm) 4px var(--radius-sm)"
                              : "var(--radius-sm) var(--radius-sm) var(--radius-sm) 4px",
                            background: mine ? "rgba(220,38,38,0.08)" : "var(--panel2)",
                            border: mine ? "1px solid rgba(220,38,38,0.2)" : "1px solid var(--border)",
                          }}
                        >
                          {m.attachment_path ? (
                            <>
                              {renderAttachment(m)}
                              {m.text != null && String(m.text).trim() !== "" && (
                                <p className="mt-2 text-sm whitespace-pre-wrap break-words m-0 text-gray-900">{m.text}</p>
                              )}
                            </>
                          ) : (
                            <p className="m-0 text-sm whitespace-pre-wrap break-words text-gray-900">
                              {m.text != null && String(m.text).trim() !== ""
                                ? m.text
                                : isPending
                                  ? "Šaljem…"
                                  : "\u00A0"}
                            </p>
                          )}
                          <p
                            className="mt-1 text-[11px] text-[var(--muted)] m-0"
                            style={{ textAlign: mine ? "right" : "left" }}
                          >
                            {relativeTime(m.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
            <div ref={bottomRef} />
              </>
            )}
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
            </div>
          )}
      </Card>

      {/* Participant details drawer — opens from header click, overlay + slide-in */}
      {meta && (
        <ParticipantDrawer open={isParticipantOpen} onClose={() => setParticipantOpen(false)}>
          <ParticipantPanel
            meta={{ otherUserName: meta.otherUserName, otherUserId: meta.otherUserId, jobTitle: meta.jobTitle }}
            onReportClick={() => {
              setParticipantOpen(false);
              setShowReport(true);
            }}
          />
        </ParticipantDrawer>
      )}

      {showReport && (
        <ReportModal
          targetType="message"
          targetId={String(conversationId)}
          onClose={() => setShowReport(false)}
        />
      )}

      {process.env.NODE_ENV === "development" && showDebug && debugInfo && (
        <div
          className="shrink-0 w-full max-w-[1000px] mx-auto mt-4 p-3 bg-gray-100 border border-gray-300 rounded text-xs font-mono overflow-auto"
          style={{ maxHeight: 320 }}
        >
          <div className="font-semibold text-gray-700 mb-2">Debug (dev)</div>
          <div>conversationId: {debugInfo.conversationId}</div>
          <div>auth uid: {debugInfo.authUid ?? "—"}</div>
          <div>convData: {debugInfo.convDataYesNo ? "yes" : "no"}</div>
          <div>convErr: {debugInfo.convErrCode ?? "—"} {debugInfo.convErrMessage ?? ""}</div>
          <div>participantRow: {debugInfo.participantRowYesNo ? "yes" : "no"}</div>
          <div>messages count: {debugInfo.messagesCount}</div>
          <div>markReadUpdatedRow: {debugInfo.markReadUpdatedRow ? JSON.stringify(debugInfo.markReadUpdatedRow) : "—"}</div>
          <div>markReadError: {debugInfo.markReadError ? JSON.stringify(debugInfo.markReadError) : "—"}</div>
          {debugInfo.markReadError?.code === "42501" && (
            <div className="text-red-600 mt-1.5">RLS UPDATE policy missing for conversation_participants. Apply migration 00018.</div>
          )}
          {(debugInfo.markReadUpdatedRow == null || debugInfo.markReadError != null) && debugInfo.markReadError?.code !== "42501" && (
            <div className="text-red-600 mt-1.5">Mark-read failed or no row updated — badge may reappear.</div>
          )}
        </div>
      )}
    </>
  );
}
