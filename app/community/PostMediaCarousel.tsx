"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { COMMUNITY_MEDIA_BUCKET } from "./communityMedia";

export type PostMediaItem = { id: string; type: "image" | "video"; path: string; sort_order?: number };

type Props = {
  media: PostMediaItem[];
  className?: string;
};

function getUrl(path: string): string {
  const { data } = supabase.storage.from(COMMUNITY_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export default function PostMediaCarousel({ media, className = "" }: Props) {
  const [index, setIndex] = useState(0);
  const sorted = [...media].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (sorted.length === 0) return null;

  const current = sorted[index];
  const hasMultiple = sorted.length > 1;
  const goPrev = useCallback(() => setIndex((i) => (i <= 0 ? sorted.length - 1 : i - 1)), [sorted.length]);
  const goNext = useCallback(() => setIndex((i) => (i >= sorted.length - 1 ? 0 : i + 1)), [sorted.length]);

  return (
    <div className={`relative w-full bg-gray-100 overflow-hidden border-b border-gray-200 ${className}`}>
      {current.type === "video" ? (
        <video
          src={getUrl(current.path)}
          controls
          className="w-full max-h-[70vh] object-contain"
          preload="metadata"
          playsInline
        />
      ) : (
        <img
          src={getUrl(current.path)}
          alt=""
          className="w-full max-h-[70vh] object-contain"
          loading="lazy"
          decoding="async"
        />
      )}

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white"
            aria-label="Prethodna"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white"
            aria-label="Sljedeća"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {sorted.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === index ? "bg-white" : "bg-white/50 hover:bg-white/70"
                }`}
                aria-label={`Slika ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
