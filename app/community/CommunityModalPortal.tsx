"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const MODAL_Z_BACKDROP = 9998;
const MODAL_Z_CONTENT = 9999;

type Props = {
  open: boolean;
  children: React.ReactNode;
  onClose: () => void;
};

/**
 * Renders modal content in a portal to document.body so it is never clipped.
 * Dims/blurs the page, locks body scroll, closes on Escape or click outside.
 */
export default function CommunityModalPortal({ open, children, onClose }: Props) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = typeof window !== "undefined" ? window.innerWidth - document.documentElement.clientWidth : 0;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        style={{ zIndex: MODAL_Z_BACKDROP }}
        aria-hidden
        onClick={onClose}
      />
      <div
        className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
        style={{ zIndex: MODAL_Z_CONTENT }}
        role="presentation"
      >
        <div className="pointer-events-auto w-full max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </>,
    document.body
  );
}
