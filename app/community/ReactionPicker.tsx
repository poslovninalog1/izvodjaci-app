"use client";

import { useState, useRef, useEffect } from "react";

export type ReactionType = "like" | "heart" | "fire" | "laugh" | "wow";

export const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "heart", emoji: "❤️", label: "Srce" },
  { type: "fire", emoji: "🔥", label: "Vatra" },
  { type: "laugh", emoji: "😂", label: "Smijeh" },
  { type: "wow", emoji: "😮", label: "Wow" },
];

type Props = {
  totalCount: number;
  myReaction: ReactionType | null;
  onSelect: (type: ReactionType | null) => void;
  disabled?: boolean;
};

export default function ReactionPicker({ totalCount, myReaction, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-sm ${myReaction ? "text-red-600" : "text-gray-500 hover:text-gray-700"} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Reaguj"
      >
        <span>{myReaction ? REACTIONS.find((r) => r.type === myReaction)?.emoji ?? "👍" : "👍"}</span>
        {totalCount > 0 && <span>{totalCount}</span>}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 flex items-center gap-0.5 rounded-xl border border-gray-200 bg-white p-1 shadow-lg premium-surface z-10">
          {REACTIONS.map((r) => (
            <button
              key={r.type}
              type="button"
              onClick={() => {
                onSelect(myReaction === r.type ? null : r.type);
                setOpen(false);
              }}
              className={`p-1.5 rounded-lg text-lg hover:bg-gray-100 ${myReaction === r.type ? "bg-red-50" : ""}`}
              title={r.label}
            >
              {r.emoji}
            </button>
          ))}
          {myReaction && (
            <button
              type="button"
              onClick={() => { onSelect(null); setOpen(false); }}
              className="p-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 border-l border-gray-200 ml-1 pl-1"
            >
              Ukloni
            </button>
          )}
        </div>
      )}
    </div>
  );
}
