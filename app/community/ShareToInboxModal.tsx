"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../components/ui/Card";
import CommunityModalPortal from "./CommunityModalPortal";

type ChatPartner = { userId: string; name: string; conversationId: string };

type Props = {
  open: boolean;
  onClose: () => void;
  postId: string;
  postTitle: string | null;
  postPreview: string;
};

export default function ShareToInboxModal({ open, onClose, postId, postTitle, postPreview }: Props) {
  const { user } = useAuth();
  const [partners, setPartners] = useState<ChatPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    setError("");
    supabase
      .from("v_inbox_threads")
      .select("conversation_id, other_user_id, other_user_name")
      .eq("user_id", user.id)
      .then(({ data, error: err }) => {
        setLoading(false);
        if (err) {
          setError(err.message);
          return;
        }
        const list: ChatPartner[] = (data ?? [])
          .filter((r: { other_user_id?: string | null }) => r.other_user_id)
          .map((r: { conversation_id: number; other_user_id: string; other_user_name?: string | null }) => ({
            userId: r.other_user_id,
            name: (r.other_user_name ?? "Korisnik").trim(),
            conversationId: String(r.conversation_id),
          }));
        setPartners(list);
      });
  }, [open, user?.id]);

  const filtered = partners.filter(
    (p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const handleShare = async (partner: ChatPartner) => {
    if (!user) return;
    setSending(partner.userId);
    setError("");

    const { data: convId, error: rpcErr } = await supabase.rpc("get_or_create_direct_conversation", {
      other_user_id: partner.userId,
    });

    if (rpcErr || convId == null) {
      setError(rpcErr?.message ?? "Greška pri otvaranju razgovora.");
      setSending(null);
      return;
    }

    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/community/${postId}`;
    const titleSnippet = (postTitle || postPreview).slice(0, 80);
    const text = `Objava: ${titleSnippet}${titleSnippet.length >= 80 ? "…" : ""}\n${link}`;

    const { error: insertErr } = await supabase.from("messages").insert({
      conversation_id: Number(convId),
      sender_id: user.id,
      text,
    });

    setSending(null);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    onClose();
  };

  if (!open) return null;

  return (
    <CommunityModalPortal open={open} onClose={onClose}>
      <div className="w-full max-w-md max-h-[85vh] flex flex-col mx-auto" role="dialog" aria-modal aria-label="Pošalji objavu">
        <Card
          className="premium-surface w-full max-h-[85vh] flex flex-col"
          style={{ overflow: "hidden" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between shrink-0 mb-4">
            <h3 className="m-0 text-lg font-semibold">Pošalji objavu</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Zatvori"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <input
            type="search"
            placeholder="Pretraži kontakte"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="premium-focus w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mb-3"
          />
          {error && <p className="m-0 mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
            {loading ? (
              <p className="text-sm text-gray-500">Učitavanje…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-500">Nema kontakata za dijeljenje.</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  className="premium-menu-item w-full text-left px-3 py-2 rounded-lg flex items-center gap-3"
                  onClick={() => handleShare(p)}
                  disabled={sending !== null}
                >
                  <span className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700 shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate font-medium">{p.name}</span>
                  {sending === p.userId ? (
                    <span className="text-xs text-gray-500">Šaljem…</span>
                  ) : (
                    <span className="text-xs text-[var(--accent)]">Pošalji</span>
                  )}
                </button>
              ))
            )}
          </div>
        </Card>
      </div>
    </CommunityModalPortal>
  );
}
