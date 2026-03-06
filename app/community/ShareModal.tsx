"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../components/ui/Card";
import CommunityModalPortal from "./CommunityModalPortal";

type ChatPartner = { userId: string; name: string; conversationId: string };
type Community = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  postId: string;
  postTitle: string | null;
  postPreview: string;
};

export default function ShareModal({ open, onClose, postId, postTitle, postPreview }: Props) {
  const { user } = useAuth();
  const [partners, setPartners] = useState<ChatPartner[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"link" | "partner" | "community">("link");

  const link = typeof window !== "undefined" ? `${window.location.origin}/community/${postId}` : "";

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    setError("");
    Promise.all([
      supabase
        .from("v_inbox_threads")
        .select("conversation_id, other_user_id, other_user_name")
        .eq("user_id", user.id)
        .then(({ data, error: err }) => {
          if (err) return [];
          return (data ?? [])
            .filter((r: { other_user_id?: string | null }) => r.other_user_id)
            .map((r: { conversation_id: number; other_user_id: string; other_user_name?: string | null }) => ({
              userId: r.other_user_id,
              name: (r.other_user_name ?? "Korisnik").trim(),
              conversationId: String(r.conversation_id),
            }));
        }),
      supabase.from("communities").select("id, name").order("name").then(({ data }) => (data ?? []) as Community[]),
    ]).then(([p, c]) => {
      setPartners(p);
      setCommunities(c);
      setLoading(false);
    });
  }, [open, user?.id]);

  const filteredPartners = partners.filter(
    (p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const copyLink = () => {
    if (typeof navigator === "undefined" || !link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShareToPartner = async (partner: ChatPartner) => {
    if (!user) return;
    setSending(partner.userId);
    setError("");
    const { data: convId, error: rpcErr } = await supabase.rpc("get_or_create_direct_conversation", {
      other_user_id: partner.userId,
    });
    if (rpcErr || convId == null) {
      setError(rpcErr?.message ?? "Greška.");
      setSending(null);
      return;
    }
    const titleSnippet = (postTitle || postPreview).slice(0, 80);
    const text = `Objava: ${titleSnippet}${titleSnippet.length >= 80 ? "…" : ""}\n${link}`;
    const { error: insertErr } = await supabase.from("messages").insert({
      conversation_id: Number(convId),
      sender_id: user.id,
      text,
    });
    if (insertErr) {
      setError(insertErr.message);
      setSending(null);
      return;
    }
    await supabase.from("community_post_shares").insert({
      post_id: postId,
      user_id: user.id,
      shared_with_user_id: partner.userId,
    });
    setSending(null);
    onClose();
  };

  const handleShareToCommunity = async (communityId: string) => {
    if (!user) return;
    setSending(communityId);
    setError("");
    await supabase.from("community_post_shares").insert({
      post_id: postId,
      user_id: user.id,
      shared_to_community_id: communityId,
    });
    setSending(null);
    onClose();
  };

  if (!open) return null;

  return (
    <CommunityModalPortal open={open} onClose={onClose}>
      <div className="w-full max-w-md max-h-[85vh] flex flex-col mx-auto" role="dialog" aria-modal aria-label="Podijeli">
      <Card
          className="premium-surface w-full max-w-md max-h-[85vh] flex flex-col"
          style={{ overflow: "hidden" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between shrink-0 mb-4 border-b border-gray-200 pb-3">
            <h3 className="m-0 text-lg font-semibold text-gray-900">Podijeli</h3>
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

          <div className="flex gap-2 border-b border-gray-200 pb-2 mb-3">
            <button
              type="button"
              onClick={() => setTab("link")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "link" ? "bg-red-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              Kopiraj link
            </button>
            <button
              type="button"
              onClick={() => setTab("partner")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "partner" ? "bg-red-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              Pošalji partneru
            </button>
            <button
              type="button"
              onClick={() => setTab("community")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "community" ? "bg-red-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              U zajednicu
            </button>
          </div>

          {error && <p className="m-0 mb-2 text-sm text-red-600">{error}</p>}

          {tab === "link" && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={link}
                className="premium-focus flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm"
              />
              <button
                type="button"
                onClick={copyLink}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
              >
                {copied ? "Kopirano!" : "Kopiraj"}
              </button>
            </div>
          )}

          {tab === "partner" && (
            <div className="flex flex-col min-h-0 flex-1">
              <input
                type="search"
                placeholder="Pretraži kontakte"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="premium-focus w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm mb-2"
              />
              <div className="overflow-y-auto space-y-1">
                {loading ? (
                  <p className="text-gray-500 text-sm">Učitavanje…</p>
                ) : filteredPartners.length === 0 ? (
                  <p className="text-gray-500 text-sm">Nema kontakata.</p>
                ) : (
                  filteredPartners.map((p) => (
                    <button
                      key={p.userId}
                      type="button"
                      className="premium-menu-item w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-gray-800 hover:bg-gray-50"
                      onClick={() => handleShareToPartner(p)}
                      disabled={sending !== null}
                    >
                      <span className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700 shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      {sending === p.userId ? <span className="text-xs text-gray-500">Šaljem…</span> : <span className="text-xs text-red-600">Pošalji</span>}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === "community" && (
            <div className="overflow-y-auto space-y-1">
              {loading ? (
                <p className="text-gray-500 text-sm">Učitavanje…</p>
              ) : communities.length === 0 ? (
                <p className="text-gray-500 text-sm">Nema zajednica.</p>
              ) : (
                communities.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="premium-menu-item w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-gray-800 hover:bg-gray-50"
                    onClick={() => handleShareToCommunity(c.id)}
                    disabled={sending !== null}
                  >
                    <span>{c.name}</span>
                    {sending === c.id ? <span className="text-xs text-gray-500">Šaljem…</span> : <span className="text-xs text-red-600">Podijeli</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </Card>
      </div>
    </CommunityModalPortal>
  );
}
