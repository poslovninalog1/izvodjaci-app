"use client";

import { useRef, useEffect } from "react";

const EMOJIS = ["😀", "😍", "😂", "😢", "😡", "👍", "👎", "❤️", "🔥", "🎉", "🙌", "🤝", "✅", "⭐"];

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  onPick: (emoji: string) => void;
};

export default function EmojiPicker({ open, onClose, anchorRef, onPick }: Props) {
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popRef}
      className="absolute z-50 mt-1 p-2 rounded-xl border border-gray-200 bg-white shadow-lg premium-surface"
      style={{ minWidth: 200 }}
    >
      <div className="grid grid-cols-7 gap-1">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="premium-menu-item w-8 h-8 flex items-center justify-center text-lg rounded-lg"
            onClick={() => {
              onPick(emoji);
              onClose();
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
