"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import {
  type ProfileSearchResult,
  isValidProfileId,
} from "@/src/lib/messagingTypes";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";

type Props = { onClose: () => void };

export default function NewConversationModal({ onClose }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const q = query.trim();
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, name")
        .ilike("full_name", `%${q}%`)
        .not("deactivated", "is", true)
        .limit(10);

      const rows = (data ?? []) as { id: string; full_name: string | null; name?: string | null }[];
      const mapped: ProfileSearchResult[] = rows.map((p) => ({
        id: p.id,
        displayName: (p.full_name ?? p.name)?.trim() || "—",
      }));
      setResults(mapped);

      if (process.env.NODE_ENV === "development") {
        const uuids = mapped.every((r) => isValidProfileId(r.id));
        console.log("[inbox search] results:", mapped.length, "all UUIDs:", uuids);
      }
      setSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSelect = async (selected: ProfileSearchResult) => {
    if (!isValidProfileId(selected.id)) {
      setError("Neispravan korisnik. Koristi samo rezultate pretrage.");
      return;
    }
    if (hasNavigatedRef.current) return;
    setCreating(true);
    setError("");
    const { data, error: err } = await supabase.rpc(
      "get_or_create_direct_conversation",
      { other_user_id: selected.id }
    );
    if (err) {
      setError(err.message);
      setCreating(false);
      return;
    }
    const conversationId = data != null ? String(data) : "";
    if (!conversationId || !/^[0-9]+$/.test(conversationId)) {
      setError("Greška: konverzacija nije kreirana.");
      setCreating(false);
      return;
    }
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    if (process.env.NODE_ENV === "development") {
      const authUid = (await supabase.auth.getUser()).data?.user?.id ?? null;
      console.log("[inbox NewConversationModal] auth uid:", authUid, "| selectedUser.id:", selected.id, "| RPC returned conversationId:", conversationId, "| single router.push(/inbox/" + conversationId + ")");
    }
    router.push(`/inbox/${conversationId}`);
    onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: 440,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Nova poruka
          </h2>
          <Button variant="ghost" onClick={onClose} style={{ padding: "4px 8px" }}>
            ✕
          </Button>
        </div>

        <Input
          placeholder="Pretraži korisnike po imenu..."
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setQuery(e.target.value)
          }
          autoFocus
          style={{ marginBottom: 12 }}
        />

        {error && (
          <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 8px" }}>
            {error}
          </p>
        )}

        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {searching && (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>Pretraga...</p>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>
              Nema rezultata.
            </p>
          )}

          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={creating}
              onClick={() => handleSelect(r)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "10px 12px",
                background: "none",
                border: "1px solid transparent",
                borderRadius: "var(--radius-sm)",
                cursor: creating ? "wait" : "pointer",
                textAlign: "left",
                fontSize: 14,
                color: "var(--text)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--panel2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--muted)",
                  flexShrink: 0,
                }}
              >
                {r.displayName[0]?.toUpperCase() ?? "?"}
              </div>
              <div style={{ fontWeight: 500 }}>{r.displayName}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
