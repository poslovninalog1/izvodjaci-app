"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import CreatePostForm from "./CreatePostForm";
import type { CreatePostFormRef } from "./CreatePostForm";
import CommunitySidebar, { type FeedFilter } from "./CommunitySidebar";
import CreateCommunityModal from "./CreateCommunityModal";
import PostCard, { type PostWithMeta, type CommentPreview } from "./PostCard";

type Community = { id: string; name: string };

const PAGE_SIZE = 20;

export default function CommunityPage() {
  const { user } = useAuth();
  const composerRef = useRef<CreatePostFormRef>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("pregled");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [createCommunityOpen, setCreateCommunityOpen] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  const fetchPosts = useCallback(
    async (
      before?: string,
      search?: string,
      order: "created_at" = "created_at",
      userId?: string | null
    ): Promise<PostWithMeta[]> => {
      let query = supabase
        .from("community_posts")
        .select("id, author_id, title, body, created_at")
        .order(order, { ascending: false })
        .limit(PAGE_SIZE);

      if (before) query = query.lt(order, before);
      if (search?.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,body.ilike.%${search.trim()}%`);
      }

      const { data: rows } = await query;
      const list = (rows ?? []) as { id: string; author_id: string; title: string | null; body: string; created_at: string }[];
      if (list.length === 0) return [];

      const postIds = list.map((r) => r.id);
      const authorIds = [...new Set(list.map((r) => r.author_id))];

      const [profilesRes, mediaRes, likeCountRes, commentCountRes, userLikesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", authorIds),
        supabase.from("community_post_media").select("id, post_id, type, path, sort_order").in("post_id", postIds),
        supabase.from("community_post_likes").select("post_id").in("post_id", postIds),
        supabase.from("community_comments").select("post_id").in("post_id", postIds),
        userId
          ? supabase.from("community_post_likes").select("post_id, reaction_type").eq("user_id", userId).in("post_id", postIds)
          : Promise.resolve({ data: [] as { post_id: string; reaction_type?: string }[] }),
      ]);

      const nameMap: Record<string, string> = {};
      (profilesRes.data ?? []).forEach((p: { id: string; full_name: string | null }) => {
        nameMap[p.id] = p.full_name ?? "—";
      });

      const likeCountMap: Record<string, number> = {};
      (likeCountRes.data ?? []).forEach((r: { post_id: string }) => {
        likeCountMap[r.post_id] = (likeCountMap[r.post_id] ?? 0) + 1;
      });

      const commentCountMap: Record<string, number> = {};
      (commentCountRes.data ?? []).forEach((r: { post_id: string }) => {
        commentCountMap[r.post_id] = (commentCountMap[r.post_id] ?? 0) + 1;
      });

      const likedSet = new Set<string>();
      const myReactionMap: Record<string, "like" | "heart" | "fire" | "laugh" | "wow"> = {};
      (userLikesRes.data ?? []).forEach((r: { post_id: string; reaction_type?: string }) => {
        likedSet.add(r.post_id);
        const t = r.reaction_type as string | undefined;
        if (t && ["like", "heart", "fire", "laugh", "wow"].includes(t)) {
          myReactionMap[r.post_id] = t as "like" | "heart" | "fire" | "laugh" | "wow";
        } else {
          myReactionMap[r.post_id] = "like";
        }
      });

      const mediaByPost = new Map<string, { id: string; type: "image" | "video"; path: string; sort_order: number }[]>();
      (mediaRes.data ?? []).forEach((m: { post_id: string; id: string; type: "image" | "video"; path: string; sort_order: number }) => {
        if (!mediaByPost.has(m.post_id)) mediaByPost.set(m.post_id, []);
        mediaByPost.get(m.post_id)!.push({ id: m.id, type: m.type, path: m.path, sort_order: m.sort_order ?? 0 });
      });

      return list.map((d) => ({
        id: d.id,
        author_id: d.author_id,
        title: d.title,
        body: d.body,
        created_at: d.created_at,
        author_name: nameMap[d.author_id] ?? "—",
        media: (mediaByPost.get(d.id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
        like_count: likeCountMap[d.id] ?? 0,
        comment_count: commentCountMap[d.id] ?? 0,
        liked_by_me: likedSet.has(d.id),
        my_reaction: myReactionMap[d.id] ?? null,
      }));
    },
    []
  );

  const fetchTopComments = useCallback(async (postIds: string[]): Promise<Record<string, CommentPreview[]>> => {
    if (postIds.length === 0) return {};
    const { data: rootComments } = await supabase
      .from("community_comments")
      .select("id, post_id, author_id, body, created_at")
      .in("post_id", postIds)
      .is("parent_id", null);

    const comments = (rootComments ?? []) as { id: string; post_id: string; author_id: string; body: string; created_at: string }[];
    if (comments.length === 0) return {};

    const commentIds = comments.map((c) => c.id);
    const authorIdsC = [...new Set(comments.map((c) => c.author_id))];

    const [profilesC, likeRows, replyRows] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", authorIdsC),
      supabase.from("community_comment_likes").select("comment_id").in("comment_id", commentIds),
      supabase.from("community_comments").select("parent_id").in("parent_id", commentIds),
    ]);

    const nameMapC: Record<string, string> = {};
    (profilesC.data ?? []).forEach((p: { id: string; full_name: string | null }) => {
      nameMapC[p.id] = p.full_name ?? "—";
    });
    const likeCountC: Record<string, number> = {};
    (likeRows.data ?? []).forEach((r: { comment_id: string }) => {
      likeCountC[r.comment_id] = (likeCountC[r.comment_id] ?? 0) + 1;
    });
    const replyCountC: Record<string, number> = {};
    (replyRows.data ?? []).forEach((r: { parent_id: string }) => {
      replyCountC[r.parent_id] = (replyCountC[r.parent_id] ?? 0) + 1;
    });

    const withMeta: (CommentPreview & { post_id: string })[] = comments.map((c) => ({
      id: c.id,
      post_id: c.post_id,
      author_name: nameMapC[c.author_id] ?? "—",
      body: c.body,
      created_at: c.created_at,
      like_count: likeCountC[c.id] ?? 0,
      reply_count: replyCountC[c.id] ?? 0,
    }));

    withMeta.sort((a, b) => {
      if (b.like_count !== a.like_count) return b.like_count - a.like_count;
      if (b.reply_count !== a.reply_count) return b.reply_count - a.reply_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    const byPost: Record<string, CommentPreview[]> = {};
    withMeta.forEach((c) => {
      const list = byPost[c.post_id] ?? [];
      if (list.length < 3) list.push(c);
      byPost[c.post_id] = list;
    });
    return byPost;
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const order = "created_at";
    const data = await fetchPosts(undefined, appliedSearch || undefined, order, user?.id ?? null);
    setPosts(data);
    const byPost = await fetchTopComments(data.map((p) => p.id));
    setPosts((prev) => prev.map((p) => ({ ...p, top_comments: byPost[p.id] ?? [] })));
    setHasMore(data.length === PAGE_SIZE);
    setLoading(false);
  }, [fetchPosts, fetchTopComments, feedFilter, appliedSearch, user?.id]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    supabase
      .from("communities")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCommunities((data ?? []) as Community[]));
  }, [createCommunityOpen]);

  useEffect(() => {
    const channel = supabase
      .channel("community_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_posts" },
        async (payload) => {
          const newPost = payload.new as Record<string, unknown>;
          const id = String(newPost.id ?? "");
          if (posts.some((p) => p.id === id)) return;
          const authorId = String(newPost.author_id ?? "");
          let authorName = "—";
          const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", authorId).maybeSingle();
          if (prof && typeof (prof as { full_name?: string }).full_name === "string") {
            authorName = (prof as { full_name: string }).full_name;
          }
          const mapped: PostWithMeta = {
            id,
            author_id: authorId,
            title: (newPost.title as string) ?? null,
            body: String(newPost.body ?? ""),
            created_at: String(newPost.created_at ?? ""),
            author_name: authorName,
            media: [],
            like_count: 0,
            comment_count: 0,
            liked_by_me: false,
            my_reaction: null,
            top_comments: [],
          };
          setPosts((prev) => [mapped, ...prev]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [posts]);

  const loadMore = useCallback(async () => {
    if (!posts.length || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const oldest = posts[posts.length - 1];
    const data = await fetchPosts(oldest.created_at, appliedSearch || undefined, "created_at", user?.id ?? null);
    setPosts((prev) => [...prev, ...data]);
    const byPost = await fetchTopComments(data.map((p) => p.id));
    setPosts((prev) => prev.map((p) => ({ ...p, top_comments: byPost[p.id] ?? p.top_comments ?? [] })));
    setHasMore(data.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [posts, loadingMore, hasMore, fetchPosts, fetchTopComments, appliedSearch, user?.id]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore && !loading) loadMore();
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, hasMore, loadingMore, loading]);

  const handleLikeToggle = useCallback((_postId: string, _liked: boolean) => {}, []);

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <CommunitySidebar
        activeFilter={feedFilter}
        onFilterChange={setFeedFilter}
        onNewPost={() => composerRef.current?.focus()}
        communities={communities}
        onCreateCommunity={() => setCreateCommunityOpen(true)}
        mobileOpen={sidebarMobileOpen}
        onCloseMobile={() => setSidebarMobileOpen(false)}
      />

      <main className="flex-1 min-w-0 flex flex-col p-4 lg:p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => setSidebarMobileOpen(true)}
            className="lg:hidden p-2 rounded-lg border border-gray-200 bg-white"
            aria-label="Meni"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <input
            type="search"
            placeholder="Pretraži objave i zajednice"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setAppliedSearch(searchQuery); }}
            className="premium-focus flex-1 max-w-xl px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm"
          />
          <Button variant="secondary" className="shrink-0" onClick={() => setAppliedSearch(searchQuery)}>
            Pretraži
          </Button>
        </div>

        {user && <CreatePostForm ref={composerRef} onCreated={loadInitial} />}

        {loading && <p className="text-gray-500 text-sm py-4">Učitavanje objava...</p>}

        {!loading && posts.length === 0 && (
          <Card className="premium-surface">
            <p className="m-0 text-gray-500 text-center py-6">Još nema objava. Budi prvi!</p>
          </Card>
        )}

        <div className="flex flex-col gap-4 mt-2">
          {!loading && posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onLikeToggle={handleLikeToggle}
              onCommentAdded={loadInitial}
            />
          ))}
        </div>

        <div ref={loadMoreRef} className="h-8 flex items-center justify-center py-6">
          {loadingMore && <span className="text-gray-500 text-sm">Učitavanje...</span>}
        </div>
      </main>

      <CreateCommunityModal
        open={createCommunityOpen}
        onClose={() => setCreateCommunityOpen(false)}
        onCreated={() => {
          setCreateCommunityOpen(false);
          supabase.from("communities").select("id, name").order("name").then(({ data }) => {
            setCommunities((data ?? []) as Community[]);
          });
        }}
      />
    </div>
  );
}
