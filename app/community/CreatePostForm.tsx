"use client";

import { useState, useRef, useImperativeHandle, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Textarea from "../components/ui/Textarea";
import Button from "../components/ui/Button";
import EmojiPicker from "./EmojiPicker";
import { COMMUNITY_MEDIA_BUCKET } from "./communityMedia";

const MAX_TITLE = 200;
const MAX_BODY = 5000;
const MAX_IMAGES = 10;
const MAX_VIDEO_SIZE_MB = 50;

type Props = {
  onCreated: () => void;
};

export type CreatePostFormRef = { focus: () => void };

const CreatePostForm = forwardRef<CreatePostFormRef, Props>(function CreatePostForm({ onCreated }, ref) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ file: File; type: "image" | "video" }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const emojiAnchorRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus() {
      setExpanded(true);
      setTimeout(() => bodyRef.current?.focus(), 50);
    },
  }));

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = body.trim().length > 0;
    const hasMedia = pendingFiles.length > 0;
    if ((!hasText && !hasMedia) || submitting) return;
    if (body.length > MAX_BODY) {
      setError(`Tekst može imati najviše ${MAX_BODY} karaktera.`);
      return;
    }
    setError("");
    setSubmitting(true);

    const { data: inserted, error: err } = await supabase
      .from("community_posts")
      .insert({
        author_id: user!.id,
        title: title.trim() || null,
        body: body.trim() || "",
      })
      .select("id")
      .single();

    if (err || !inserted?.id) {
      setSubmitting(false);
      setError(err?.message ?? "Greška pri kreiranju objave.");
      return;
    }

    const postId = inserted.id as string;
    const basePath = `${user!.id}/${postId}`;

    for (let i = 0; i < pendingFiles.length; i++) {
      const { file, type } = pendingFiles[i];
      const ext = file.name.split(".").pop() || "bin";
      const path = `${basePath}/${Date.now()}-${i}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(COMMUNITY_MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });

      if (uploadErr) {
        setError(uploadErr.message);
        setSubmitting(false);
        return;
      }

      await supabase.from("community_post_media").insert({
        post_id: postId,
        type,
        path,
        sort_order: i,
      });
    }

    setSubmitting(false);
    setTitle("");
    setBody("");
    setPendingFiles([]);
    setExpanded(false);
    onCreated();

    router.push(`/community/${postId}`);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const videos = files.filter((f) => f.type.startsWith("video/"));
    const images = files.filter((f) => f.type.startsWith("image/"));
    const newList: { file: File; type: "image" | "video" }[] = [];
    if (videos.length > 0) {
      const v = videos[0];
      if (v.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
        setError(`Video može imati najviše ${MAX_VIDEO_SIZE_MB} MB.`);
        return;
      }
      newList.push({ file: v, type: "video" });
    } else {
      for (let i = 0; i < Math.min(images.length, MAX_IMAGES); i++) {
        newList.push({ file: images[i], type: "image" });
      }
      if (images.length > MAX_IMAGES) setError(`Maksimalno ${MAX_IMAGES} slika.`);
    }
    setPendingFiles((prev) => (newList.length > 0 ? newList : prev));
    setError("");
    e.target.value = "";
  };

  const removeFile = (i: number) => {
    setPendingFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  const insertEmoji = (emoji: string) => {
    const ta = bodyRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd ?? start;
      const before = body.slice(0, start);
      const after = body.slice(end);
      setBody(before + emoji + after);
      setTimeout(() => {
        const newPos = start + emoji.length;
        ta.setSelectionRange(newPos, newPos);
        ta.focus();
      }, 0);
    } else {
      setBody((prev) => prev + emoji);
    }
  };

  if (!expanded) {
    return (
      <Card
        className="premium-surface cursor-pointer mb-5"
        onClick={() => setExpanded(true)}
      >
        <p className="m-0 text-gray-500 text-sm">
          {profile?.deactivated
            ? "Nalog je deaktiviran"
            : "Napiši novu objavu..."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="premium-surface mb-5">
      <form onSubmit={handleSubmit}>
        <h3 className="m-0 mb-3 text-base font-semibold text-gray-900">Nova objava</h3>

        <Input
          placeholder="Naslov (opciono)"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setTitle(e.target.value)
          }
          maxLength={MAX_TITLE}
          className="mb-2"
        />

        <Textarea
          ref={bodyRef}
          placeholder="Šta želiš da podeliš?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY}
          rows={4}
          autoFocus
          className="mb-2"
        />

        <div className="flex items-center gap-2 mb-2 relative">
          <button
            ref={emojiAnchorRef}
            type="button"
            onClick={() => setEmojiOpen((o) => !o)}
            className="p-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100"
            title="Dodaj emoji"
            aria-label="Emoji"
          >
            😀
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100"
            title="Dodaj sliku ili video"
            aria-label="Medija"
          >
            📷
          </button>
          <EmojiPicker
            open={emojiOpen}
            onClose={() => setEmojiOpen(false)}
            anchorRef={emojiAnchorRef}
            onPick={insertEmoji}
          />
        </div>

        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingFiles.map((item, i) => (
              <div key={i} className="relative">
                {item.type === "image" ? (
                  <img
                    src={URL.createObjectURL(item.file)}
                    alt=""
                    className="h-20 w-20 object-cover rounded border border-gray-200"
                  />
                ) : (
                  <div className="h-20 w-20 rounded border border-gray-200 bg-gray-100 flex items-center justify-center text-2xl">
                    🎥
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs"
                  aria-label="Ukloni"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-red-600 text-sm m-0 mb-2">{error}</p>
        )}

        <div className="flex justify-between items-center gap-2">
          <span className="text-xs text-gray-500">
            {body.length} / {MAX_BODY}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              type="button"
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
              disabled={(!body.trim() && pendingFiles.length === 0) || submitting || !!profile?.deactivated}
            >
              {submitting ? "Objavljujem..." : "Objavi"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
});

export default CreatePostForm;
