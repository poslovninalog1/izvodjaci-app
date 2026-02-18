"use client";

import Modal from "./Modal";
import Button from "./Button";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
};

export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Potvrdi",
  variant = "primary",
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const handleConfirm = async () => {
    await onConfirm();
    // Parent typically closes via setState in onConfirm callback
  };

  return (
    <Modal title={title} onClose={onCancel}>
      <p style={{ margin: "0 0 20px", color: "var(--muted)" }}>{message}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="secondary" onClick={onCancel}>Odustani</Button>
        <Button
          variant={variant === "danger" ? "danger" : "primary"}
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? "..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
