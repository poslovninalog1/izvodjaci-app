"use client";

import { useEffect } from "react";

type Props = {
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
};

export default function Modal({ title, children, onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
      style={{
        background: "#ffffff",
        border: "1px solid var(--border)",
          padding: 24,
          borderRadius: "var(--radius-md)",
          maxWidth: 440,
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}
