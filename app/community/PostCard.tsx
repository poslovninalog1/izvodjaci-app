"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { relativeTime } from "@/src/lib/time";
import PostMediaCarousel, { type PostMediaItem } from "./PostMediaCarousel";
import ShareModal from "./ShareModal";
import ShareToInboxModal from "./ShareToInboxModal";
import PostComments from "./PostComments";
import ReactionPicker, { type ReactionType } from "./ReactionPicker";

export type CommentPreview = {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
  like_count: number;
  reply_count: number;
};

export type PostWithMeta = {
  id: string;
  author_id: string;
  title: string | null;
  body: string;
  created_at: string;
  author_name: string;
  media: PostMediaItem[];
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  my_reaction?: "like" | "heart" | "fire" | "laugh" | "wow" | null;
  top_comments?: CommentPreview[];
};

type Props = {
  post: PostWithMeta;
  onLikeToggle: (postId: string, liked: boolean) => void;
  onCommentAdded?: () => void;
};

export default function PostCard({ post, onLikeToggle, onCommentAdded }: Props) {
  const { user } = useAuth();
  const [reactionCount, setReactionCount] = useState(post.like_count);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(post.my_reaction ?? (post.liked_by_me ? "like" : null));
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [shareOpen, setShareOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const handleReaction = useCallback(
    async (type: ReactionType | null) => {
      if (!user) return;
      const hadReaction = myReaction !== null;
      const hasReaction = type !== null;
      setMyReaction(type);
      setReactionCount((c) => c + (hasReaction ? (hadReaction ? 0 : 1) : hadReaction ? -1 : 0));
      onLikeToggle(post.id, hasReaction);

      if (hasReaction) {
        if (hadReaction) {
          await supabase
            .from("community_post_likes")
            .update({ reaction_type: type })
            .eq("post_id", post.id)
            .eq("user_id", user.id);
        } else {
          await supabase.from("community_post_likes").insert({
            post_id: post.id,
            user_id: user.id,
            reaction_type: type,
          });
        }
      } else {
        await supabase.from("community_post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      }
    },
    [user, post.id, myReaction, onLikeToggle]
  );

  const preview = post.body.length > 300 ? post.body.slice(0, 300) + "…" : post.body;

  return (
    <article className="premium-surface rounded-xl border border-gray-200 overflow-hidden">
      {/* Media first */}
      {post.media.length > 0 && (
        <PostMediaCarousel media={post.media} className="rounded-t-xl" />
      )}

      <div className="p-4">
        <Link
          href={`/community/${post.id}`}
          className="block"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700 shrink-0">
              {post.author_name[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="font-medium text-sm text-gray-900">{post.author_name}</span>
            <span className="text-xs text-gray-500">{relativeTime(post.created_at)}</span>
          </div>
          {post.title && <h3 className="m-0 mb-1 text-base font-semibold text-gray-900">{post.title}</h3>}
          {post.body && (
            <p className="m-0 text-sm text-gray-700 whitespace-pre-wrap break-words line-clamp-4">
              {preview}
            </p>
          )}
          {post.body.length > 300 && (
            <span className="text-xs text-[var(--accent)] mt-1 inline-block">Pročitaj više →</span>
          )}
        </Link>

        {/* Interaction row */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-200 text-sm">
          {user ? (
            <ReactionPicker
              totalCount={reactionCount}
              myReaction={myReaction}
              onSelect={handleReaction}
            />
          ) : (
            <span className="flex items-center gap-1 text-gray-500">
              <span>👍</span>
              <span>{reactionCount}</span>
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setCommentsOpen((o) => !o);
            }}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
          >
            <span>💬</span>
            <span>{commentCount}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShareOpen(true);
            }}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
          >
            <span>🔁</span>
            <span>Podijeli</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setSendOpen(true);
            }}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
          >
            <span>📤</span>
            <span>Pošalji</span>
          </button>
        </div>

        {/* Top comments preview */}
        {post.top_comments && post.top_comments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 mb-2">Komentari</p>
            <div className="space-y-2">
              {post.top_comments.map((c) => (
                <div key={c.id} className="text-sm">
                  <span className="font-medium text-gray-800">{c.author_name}</span>
                  <span className="text-gray-500 text-xs ml-1">{relativeTime(c.created_at)}</span>
                  <p className="m-0 text-gray-700 text-sm mt-0.5 line-clamp-2">{c.body}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    {c.like_count > 0 && <span>👍 {c.like_count}</span>}
                    {c.reply_count > 0 && <span>💬 {c.reply_count}</span>}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setCommentsOpen(true); }}
              className="text-xs text-[var(--accent)] hover:underline mt-1"
            >
              Pogledaj sve komentare ({commentCount})
            </button>
          </div>
        )}

        {/* Quick comments */}
        {commentsOpen && (
          <PostComments
            postId={post.id}
            onCountChange={setCommentCount}
            onAdded={onCommentAdded}
          />
        )}
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        postId={post.id}
        postTitle={post.title}
        postPreview={preview.slice(0, 80)}
      />
      {sendOpen && (
        <ShareToInboxModal
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          postId={post.id}
          postTitle={post.title}
          postPreview={preview.slice(0, 80)}
        />
      )}
    </article>
  );
}
