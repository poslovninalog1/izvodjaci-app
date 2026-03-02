"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export default function ParticipantDrawer({ open, onClose, children }: Props) {
  const [slideIn, setSlideIn] = useState(false);

  useEffect(() => {
    if (!open) {
      setSlideIn(false);
      return;
    }
    document.body.style.overflow = "hidden";
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSlideIn(true));
    });
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Overlay — dim everything, click to close */}
      <div
        role="presentation"
        aria-hidden
        className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-200"
        onClick={onClose}
      />
      {/* Drawer — slides in from right */}
      <div
        role="dialog"
        aria-label="Detalji učesnika"
        className={`fixed top-0 right-0 h-full w-[360px] max-w-[90vw] bg-white z-50 shadow-xl flex flex-col transition-transform duration-200 ease-out ${
          slideIn ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">Detalji učesnika</span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Zatvori"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
      </div>
    </>
  );
}
