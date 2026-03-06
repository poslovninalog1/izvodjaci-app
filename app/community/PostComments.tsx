"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { relativeTime } from "@/src/lib/time";

export type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  author_name: string;
  like_count: number;
  liked_by_me: boolean;
};

type Props = {
  postId: string;
  onCountChange: (count: number) => void;
  onAdded?: () => void;
};

function buildTree(rows: CommentRow[]): CommentTreeItem[] {
  const byParent = new Map<string | null, CommentRow[]>();
  rows.forEach((r) => {
    const key = r.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(r);
  });
  const roots = (byParent.get(null) ?? []).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return roots.map((root) => ({
    comment: root,
    children: buildTree(rows.filter((r) => r.parent_id === root.id)).sort(
      (a, b) => new Date(a.comment.created_at).getTime() - new Date(b.comment.created_at).getTime()
    ),
  }));
}

type CommentTreeItem = { comment: CommentRow; children: CommentTreeItem[] };

export default function PostComments({ postId, onCountChange, onAdded }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchComments = useCallback(async () => {
    const { data: rows } = await supabase
      .from("community_comments")
      .select("id, post_id, author_id, body, created_at, parent_id")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    const list = (rows ?? []) as { id: string; author_id: string; body: string; created_at: string; parent_id: string | null }[];
    if (list.length === 0) {
      setComments([]);
      onCountChange(0);
      setLoading(false);
      return;
    }

    const authorIds = [...new Set(list.map((r) => r.author_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", authorIds);
    const nameMap: Record<string, string> = {};
    (profiles ?? []).forEach((p: { id: string; full_name: string | null }) => {
      nameMap[p.id] = p.full_name ?? "—";
    });

    const { data: likeRows } = await supabase
      .from("community_comment_likes")
      .select("comment_id, user_id")
      .in("comment_id", list.map((r) => r.id));

    const likeCountMap: Record<string, number> = {};
    const likedSet = new Set<string>();
    (likeRows ?? []).forEach((r: { comment_id: string; user_id: string }) => {
      likeCountMap[r.comment_id] = (likeCountMap[r.comment_id] ?? 0) + 1;
      if (user && r.user_id === user.id) likedSet.add(r.comment_id);
    });

    const mapped: CommentRow[] = list.map((d) => ({
      id: d.id,
      post_id: postId,
      author_id: d.author_id,
      body: d.body,
      created_at: d.created_at,
      parent_id: d.parent_id,
      author_name: nameMap[d.author_id] ?? "—",
      like_count: likeCountMap[d.id] ?? 0,
      liked_by_me: likedSet.has(d.id),
    }));

    setComments(mapped);
    onCountChange(mapped.length);
    setLoading(false);
  }, [postId, user?.id, onCountChange]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent, parentId: string | null) => {
    e.preventDefault();
    if (!user || submitting) return;
    const body = parentId ? replyBody.trim() : newBody.trim();
    if (!body) return;
    setError("");
    setSubmitting(true);

    const { error: err } = await supabase.from("community_comments").insert({
      post_id: postId,
      author_id: user.id,
      body,
      parent_id: parentId,
    });

    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (parentId) {
      setReplyTo(null);
      setReplyBody("");
    } else {
      setNewBody("");
    }
    fetchComments();
    onAdded?.();
  };

  const toggleCommentLike = async (commentId: string, currentlyLiked: boolean) => {
    if (!user) return;
    if (currentlyLiked) {
      await supabase.from("community_comment_likes").delete().eq("comment_id", commentId).eq("user_id", user.id);
    } else {
      await supabase.from("community_comment_likes").insert({ comment_id: commentId, user_id: user.id });
    }
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, like_count: c.like_count + (currentlyLiked ? -1 : 1), liked_by_me: !currentlyLiked }
          : c
      )
    );
  };

  const tree = buildTree(comments);

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <p className="text-xs text-gray-500 mb-2 font-medium">Komentari</p>

      {user && (
        <form onSubmit={(e) => handleSubmit(e, null)} className="mb-3">
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Dodaj komentar..."
            rows={2}
            maxLength={2000}
            className="premium-focus w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm resize-none"
          />
          <div className="flex justify-end gap-2 mt-1">
            <button
              type="submit"
              disabled={!newBody.trim() || submitting}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm disabled:opacity-50"
            >
              {submitting ? "Šaljem..." : "Objavi"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Učitavanje…</p>
      ) : (
        <div className="space-y-2">
          {tree.map((item) => (
            <CommentTree
              key={item.comment.id}
              item={item}
              replyTo={replyTo}
              replyBody={replyBody}
              setReplyBody={setReplyBody}
              setReplyTo={setReplyTo}
              user={user}
              onSubmitReply={handleSubmit}
              submitting={submitting}
              onLike={toggleCommentLike}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentTree({
  item,
  replyTo,
  replyBody,
  setReplyBody,
  setReplyTo,
  user,
  onSubmitReply,
  submitting,
  onLike,
  depth = 0,
}: {
  item: CommentTreeItem;
  replyTo: string | null;
  replyBody: string;
  setReplyBody: (v: string) => void;
  setReplyTo: (id: string | null) => void;
  user: { id: string } | null;
  onSubmitReply: (e: React.FormEvent, parentId: string | null) => void;
  submitting: boolean;
  onLike: (commentId: string, currentlyLiked: boolean) => void;
  depth?: number;
}) {
  const { comment, children } = item;
  const marginLeft = depth > 0 ? "ml-6 pl-3 border-l-2 border-gray-200" : "";

  return (
    <div className={depth > 0 ? `mt-2 ${marginLeft}` : ""}>
      <CommentItem
        comment={comment}
        onLike={() => onLike(comment.id, comment.liked_by_me)}
        onReply={() => setReplyTo(comment.id)}
        user={user}
      />
      {replyTo === comment.id && user && (
        <form onSubmit={(e) => onSubmitReply(e, comment.id)} className="mt-2">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Odgovori..."
            rows={2}
            maxLength={2000}
            className="premium-focus w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm resize-none"
            autoFocus
          />
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={() => { setReplyTo(null); setReplyBody(""); }} className="text-sm text-gray-500 hover:text-gray-700">
              Otkaži
            </button>
            <button type="submit" disabled={!replyBody.trim() || submitting} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm">
              Odgovori
            </button>
          </div>
        </form>
      )}
      {children.map((childItem) => (
        <CommentTree
          key={childItem.comment.id}
          item={childItem}
          replyTo={replyTo}
          replyBody={replyBody}
          setReplyBody={setReplyBody}
          setReplyTo={setReplyTo}
          user={user}
          onSubmitReply={onSubmitReply}
          submitting={submitting}
          onLike={onLike}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function CommentItem({
  comment,
  onLike,
  onReply,
  user,
}: {
  comment: CommentRow;
  onLike: () => void;
  onReply: () => void;
  user: { id: string } | null;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="font-medium text-gray-700">{comment.author_name}</span>
        <span>{relativeTime(comment.created_at)}</span>
      </div>
      <p className="m-0 text-sm text-gray-700 whitespace-pre-wrap break-words mt-0.5">{comment.body}</p>
      <div className="flex items-center gap-3 mt-1">
        <button type="button" onClick={onLike} className={`text-xs ${comment.liked_by_me ? "text-red-600" : "text-gray-500 hover:text-gray-700"}`}>
          👍 {comment.like_count > 0 ? comment.like_count : ""}
        </button>
        {user && (
          <button type="button" onClick={onReply} className="text-xs text-gray-500 hover:text-gray-700">
            Odgovori
          </button>
        )}
      </div>
    </div>
  );
}
