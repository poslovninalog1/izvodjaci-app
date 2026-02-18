"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import { useToast } from "../../context/ToastContext";
import ReportModal from "../../../components/ReportModal";
import InboxSidebar from "../InboxSidebar";
import Card from "../../../components/ui/Card";
import Textarea from "../../../components/ui/Textarea";
import Button from "../../../components/ui/Button";
import { sr } from "@/src/lib/strings/sr";

type Message = {
  id: number;
  text: string;
  sender_id: string;
  created_at: string;
};

const MAX_MESSAGE_LENGTH = 2000;

export default function InboxChatPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();
  const conversationId = Number(params.conversationId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<{ contract_id: number; jobs: unknown } | null>(null);
  const [counterpartName, setCounterpartName] = useState("");
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showReport, setShowReport] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/inbox/" + conversationId);
      return;
    }
  }, [user, authLoading, router, conversationId]);

  useEffect(() => {
    if (!user || !conversationId) return;
    const uid = user.id;
    async function load() {
      const { data: convData, error: convErr } = await supabase
        .from("conversations")
        .select("id, contract_id, contracts(client_id, freelancer_id, jobs(title))")
        .eq("id", conversationId)
        .single();

      if (convErr || !convData) {
        setConversation(null);
        setLoading(false);
        return;
      }

      const c = convData as unknown as { contract_id: number; contracts: { client_id: string; freelancer_id: string; jobs: unknown } };
      const ct = c.contracts;
      if (!ct || (ct.client_id !== uid && ct.freelancer_id !== uid)) {
        setConversation(null);
        setLoading(false);
        return;
      }

      setConversation({ contract_id: c.contract_id, jobs: ct.jobs });

      const counterpartId = ct.client_id === uid ? ct.freelancer_id : ct.client_id;
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", counterpartId).single();
      setCounterpartName((prof as { full_name?: string })?.full_name ?? "—");

      const { data: msgData } = await supabase
        .from("messages")
        .select("id, text, sender_id, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      setMessages((msgData as Message[]) ?? []);
      setLoading(false);
    }
    load();
  }, [user?.id, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getJobTitle = () => {
    const j = conversation?.jobs;
    if (!j) return "—";
    if (Array.isArray(j)) return (j[0] as { title?: string })?.title ?? "—";
    return (j as { title?: string })?.title ?? "—";
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
      setError("Greška: " + err.message);
      return;
    }
    toast.success("Poruka poslata.");
    setText("");
    const { data: msgData } = await supabase
      .from("messages")
      .select("id, text, sender_id, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setMessages((msgData as Message[]) ?? []);
  };

  if (authLoading || !user) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p>{sr.conversationNotFound}</p>
        <Link href="/inbox" style={{ color: "var(--accent)" }}>← {sr.backToInbox}</Link>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, maxWidth: 1000, margin: "0 auto", minHeight: "calc(100vh - 180px)" }}>
      <div>
        <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>Inbox</h1>
        <InboxSidebar selectedId={conversationId} />
      </div>

      <Card style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600 }}>{getJobTitle()}</h2>
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>Razgovor sa {counterpartName}</p>
          </div>
          <Button variant="secondary" onClick={() => setShowReport(true)} style={{ padding: "6px 12px", fontSize: 12 }}>
            {sr.report}
          </Button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minHeight: 200,
          }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.sender_id === user.id ? "flex-end" : "flex-start",
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                background: m.sender_id === user.id ? "rgba(220,38,38,0.1)" : "var(--panel2)",
                border: m.sender_id === user.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{m.text}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--muted)" }}>
                {new Date(m.created_at).toLocaleString("sr-Latn")}
              </p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
          {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</p>}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={profile?.deactivated ? sr.deactivated : "Napiši poruku..."}
            rows={3}
            disabled={!!profile?.deactivated}
            style={{ marginBottom: 8 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{text.length} / {MAX_MESSAGE_LENGTH}</span>
            <Button type="submit" variant="primary" disabled={sending || !text.trim() || !!profile?.deactivated}>
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
