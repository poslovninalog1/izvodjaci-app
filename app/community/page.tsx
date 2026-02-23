"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { relativeTime } from "@/src/lib/time";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import CreatePostForm from "./CreatePostForm";

type Post = {
  id: string;
  author_id: string;
  title: string | null;
  body: string;
  created_at: string;
  author_name: string;
};

const PAGE_SIZE = 20;

export default function CommunityPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPosts = useCallback(
    async (before?: string) => {
      let query = supabase
        .from("community_posts")
        .select("id, author_id, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (before) {
        query = query.lt("created_at", before);
      }

      const { data: rows } = await query;

      const list = (rows ?? []) as { id: string; author_id: string; title: string | null; body: string; created_at: string }[];
      if (list.length === 0) return [];

      const authorIds = [...new Set(list.map((r) => r.author_id))];
      let nameMap: Record<string, string> = {};
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds);
      (profiles ?? []).forEach((p: { id: string; full_name: string | null }) => {
        nameMap[p.id] = p.full_name ?? "—";
      });

      return list.map((d) => ({
        id: d.id,
        author_id: d.author_id,
        title: d.title,
        body: d.body,
        created_at: d.created_at,
        author_name: nameMap[d.author_id] ?? "—",
      }));
    },
    []
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const data = await fetchPosts();
    setPosts(data);
    setHasMore(data.length === PAGE_SIZE);
    setLoading(false);
  }, [fetchPosts]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Realtime: prepend new posts
  useEffect(() => {
    const channel = supabase
      .channel("community_feed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_posts",
        },
        async (payload) => {
          const newPost = payload.new as Record<string, unknown>;
          const id = String(newPost.id ?? "");
          const authorId = String(newPost.author_id ?? "");
          let authorName = "—";
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", authorId)
            .maybeSingle();
          if (prof && typeof (prof as { full_name?: string }).full_name === "string") {
            authorName = (prof as { full_name: string }).full_name;
          }

          const mapped: Post = {
            id,
            author_id: authorId,
            title: (newPost.title as string) ?? null,
            body: String(newPost.body ?? ""),
            created_at: String(newPost.created_at ?? ""),
            author_name: authorName,
          };

          setPosts((prev) => {
            if (prev.some((p) => p.id === mapped.id)) return prev;
            return [mapped, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMore = async () => {
    if (!posts.length || loadingMore) return;
    setLoadingMore(true);
    const oldest = posts[posts.length - 1];
    const data = await fetchPosts(oldest.created_at);
    setPosts((prev) => [...prev, ...data]);
    setHasMore(data.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          marginBottom: 20,
        }}
      >
        Zajednica
      </h1>

      {user && <CreatePostForm onCreated={loadInitial} />}

      {loading && (
        <p style={{ color: "var(--muted)" }}>Učitavanje objava...</p>
      )}

      {!loading && posts.length === 0 && (
        <Card>
          <p style={{ margin: 0, color: "var(--muted)", textAlign: "center" }}>
            Još nema objava. Budi prvi!
          </p>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {posts.map((post) => {
          const preview =
            post.body.length > 300
              ? post.body.slice(0, 300) + "…"
              : post.body;

          return (
            <Link
              key={post.id}
              href={`/community/${post.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <Card
                style={{
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--panel2)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--muted)",
                        flexShrink: 0,
                      }}
                    >
                      {post.author_name[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                        }}
                      >
                        {post.author_name}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          marginLeft: 8,
                        }}
                      >
                        {relativeTime(post.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {post.title && (
                  <h3
                    style={{
                      margin: "0 0 6px",
                      fontSize: 17,
                      fontWeight: 600,
                    }}
                  >
                    {post.title}
                  </h3>
                )}

                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: "var(--text)",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {preview}
                </p>

                {post.body.length > 300 && (
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--accent)",
                      marginTop: 6,
                      display: "inline-block",
                    }}
                  >
                    Pročitaj više →
                  </span>
                )}
              </Card>
            </Link>
          );
        })}
      </div>

      {hasMore && (
        <div style={{ textAlign: "center", marginTop: 20, marginBottom: 40 }}>
          <Button
            variant="secondary"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Učitavam..." : "Učitaj još"}
          </Button>
        </div>
      )}
    </div>
  );
}
