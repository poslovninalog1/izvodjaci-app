"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { relativeTime } from "@/src/lib/time";
import Card from "../../components/ui/Card";
import Textarea from "../../components/ui/Textarea";
import Button from "../../components/ui/Button";
import PostMediaCarousel from "../PostMediaCarousel";

type Post = {
  id: string;
  author_id: string;
  title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author_name: string;
  media: { id: string; type: "image" | "video"; path: string; sort_order?: number }[];
};

type Comment = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name: string;
};

const MAX_COMMENT = 2000;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidPostId(id: string): boolean {
  return typeof id === "string" && id.length > 0 && (UUID_REGEX.test(id) || /^\d+$/.test(id));
}

export default function PostDetailPage() {
  const params = useParams();
  const postId = (params.postId as string) ?? "";
  const { user, profile } = useAuth();

  if (process.env.NODE_ENV === "development" && postId) {
    // eslint-disable-next-line no-console
    console.log("[community postId]", postId, "uuid:", UUID_REGEX.test(postId));
  }

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadPost = useCallback(async () => {
    if (!isValidPostId(postId)) {
      setPost(null);
      setLoading(false);
      return;
    }

    const { data: postData, error: postErr } = await supabase
      .from("community_posts")
      .select("id, author_id, title, body, created_at, updated_at")
      .eq("id", postId)
      .maybeSingle();

    if (postErr || !postData) {
      setPost(null);
      setLoading(false);
      return;
    }

    const { data: mediaRows } = await supabase
      .from("community_post_media")
      .select("id, type, path, sort_order")
      .eq("post_id", postId)
      .order("sort_order");

    const media = ((mediaRows ?? []) as { id: string; type: "image" | "video"; path: string; sort_order: number }[]).map((m) => ({
      ...m,
      sort_order: m.sort_order ?? 0,
    }));

    const d = postData as Record<string, unknown>;
    let authorName = "—";
    const authorId = d.author_id as string;
    if (authorId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", authorId)
        .maybeSingle();
      authorName = (prof as { full_name?: string } | null)?.full_name ?? "—";
    }

    setPost({
      id: d.id as string,
      author_id: authorId,
      title: d.title as string | null,
      body: d.body as string,
      created_at: d.created_at as string,
      updated_at: d.updated_at as string,
      author_name: authorName,
      media,
    });
    setLoading(false);
  }, [postId]);

  const loadComments = useCallback(async () => {
    if (!isValidPostId(postId)) return;

    const { data: commentRows } = await supabase
      .from("community_comments")
      .select("id, author_id, body, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    const rows = (commentRows ?? []) as { id: string; author_id: string; body: string; created_at: string }[];
    const authorIds = [...new Set(rows.map((r) => r.author_id))];
    let nameMap: Record<string, string> = {};
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds);
      (profiles ?? []).forEach((p: { id: string; full_name: string | null }) => {
        nameMap[p.id] = p.full_name ?? "—";
      });
    }

    const mapped: Comment[] = rows.map((d) => ({
      id: d.id,
      author_id: d.author_id,
      body: d.body,
      created_at: d.created_at,
      author_name: nameMap[d.author_id] ?? "—",
    }));
    setComments(mapped);
  }, [postId]);

  useEffect(() => {
    loadPost();
    loadComments();
  }, [loadPost, loadComments]);

  // Realtime comments
  useEffect(() => {
    const channel = supabase
      .channel(`comments:${postId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_comments",
          filter: `post_id=eq.${postId}`,
        },
        async (payload) => {
          const newComment = payload.new as Record<string, unknown>;
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", newComment.author_id as string)
            .single();

          const mapped: Comment = {
            id: newComment.id as string,
            author_id: newComment.author_id as string,
            body: newComment.body as string,
            created_at: newComment.created_at as string,
            author_name:
              (prof as { full_name?: string })?.full_name ?? "—",
          };

          setComments((prev) => {
            if (prev.some((c) => c.id === mapped.id)) return prev;
            return [...prev, mapped];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !commentText.trim() || submitting) return;
    if (commentText.length > MAX_COMMENT) {
      setError(`Komentar može imati najviše ${MAX_COMMENT} karaktera.`);
      return;
    }
    setError("");
    setSubmitting(true);

    const { error: err } = await supabase
      .from("community_comments")
      .insert({
        post_id: postId,
        author_id: user.id,
        body: commentText.trim(),
      });

    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setCommentText("");
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <p style={{ color: "var(--muted)" }}>Učitavanje...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <p>Objava nije pronađena.</p>
        <Link href="/community" style={{ color: "var(--accent)" }}>
          ← Nazad na Zajednicu
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <Link
        href="/community"
        style={{
          color: "var(--accent)",
          fontSize: 14,
          display: "inline-block",
          marginBottom: 16,
        }}
      >
        ← Nazad na Zajednicu
      </Link>

      {/* Post */}
      <Card style={{ marginBottom: 24, overflow: "hidden", padding: 0 }}>
        {post.media && post.media.length > 0 && (
          <PostMediaCarousel media={post.media} />
        )}
        <div style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
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
            {post.author_name[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <span style={{ fontWeight: 500, fontSize: 15 }}>
              {post.author_name}
            </span>
            <span
              style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}
            >
              {relativeTime(post.created_at)}
            </span>
          </div>
        </div>

        {post.title && (
          <h1
            style={{
              margin: "0 0 12px",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            {post.title}
          </h1>
        )}

        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {post.body}
        </p>
        </div>
      </Card>

      {/* Comments section */}
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        Komentari ({comments.length})
      </h3>

      {comments.length === 0 && (
        <p
          style={{
            color: "var(--muted)",
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          Još nema komentara.
        </p>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {comments.map((c) => (
          <Card key={c.id} style={{ padding: "12px 16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--muted)",
                  flexShrink: 0,
                }}
              >
                {c.author_name[0]?.toUpperCase() ?? "?"}
              </div>
              <span style={{ fontWeight: 500, fontSize: 14 }}>
                {c.author_name}
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {relativeTime(c.created_at)}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {c.body}
            </p>
          </Card>
        ))}
      </div>

      {/* Comment form */}
      {user ? (
        <Card>
          <form onSubmit={handleComment}>
            <Textarea
              placeholder={
                profile?.deactivated
                  ? "Nalog je deaktiviran"
                  : "Napiši komentar..."
              }
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={MAX_COMMENT}
              rows={3}
              disabled={!!profile?.deactivated}
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
                {commentText.length} / {MAX_COMMENT}
              </span>
              <Button
                type="submit"
                variant="primary"
                disabled={
                  !commentText.trim() ||
                  submitting ||
                  !!profile?.deactivated
                }
              >
                {submitting ? "Šaljem..." : "Komentariši"}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
            <Link href="/login" style={{ color: "var(--accent)" }}>
              Prijavi se
            </Link>{" "}
            da bi komentarisao.
          </p>
        </Card>
      )}
    </div>
  );
}
