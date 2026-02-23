"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Textarea from "../components/ui/Textarea";
import Button from "../components/ui/Button";

const MAX_TITLE = 200;
const MAX_BODY = 5000;

type Props = {
  onCreated: () => void;
};

export default function CreatePostForm({ onCreated }: Props) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || submitting) return;
    if (body.length > MAX_BODY) {
      setError(`Tekst može imati najviše ${MAX_BODY} karaktera.`);
      return;
    }
    setError("");
    setSubmitting(true);

    const { data: inserted, error: err } = await supabase
      .from("community_posts")
      .insert({
        author_id: user.id,
        title: title.trim() || null,
        body: body.trim(),
      })
      .select("id")
      .single();

    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }

    setTitle("");
    setBody("");
    setExpanded(false);
    onCreated();

    if (inserted?.id) {
      router.push(`/community/${inserted.id}`);
    }
  };

  if (!expanded) {
    return (
      <Card
        style={{ cursor: "pointer", marginBottom: 20 }}
        onClick={() => setExpanded(true)}
      >
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          {profile?.deactivated
            ? "Nalog je deaktiviran"
            : "Napiši novu objavu..."}
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <form onSubmit={handleSubmit}>
        <h3
          style={{
            margin: "0 0 12px",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          Nova objava
        </h3>

        <Input
          placeholder="Naslov (opciono)"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setTitle(e.target.value)
          }
          maxLength={MAX_TITLE}
          style={{ marginBottom: 10 }}
        />

        <Textarea
          placeholder="Šta želiš da podeliš?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY}
          rows={4}
          autoFocus
          style={{ marginBottom: 8 }}
        />

        {error && (
          <p
            style={{
              color: "var(--danger)",
              fontSize: 13,
              margin: "0 0 8px",
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {body.length} / {MAX_BODY}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="ghost"
              onClick={() => {
                setExpanded(false);
                setTitle("");
                setBody("");
                setError("");
              }}
            >
              Otkaži
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!body.trim() || submitting || !!profile?.deactivated}
            >
              {submitting ? "Objavljujem..." : "Objavi"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
