"use client";

type Variant = "active" | "completed" | "cancelled" | "closed" | "muted" | "accent";

type Props = {
  variant?: Variant;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

const styles: Record<Variant, React.CSSProperties> = {
  active: { background: "var(--accent)", color: "#fff" },
  completed: { background: "var(--panel2)", color: "var(--muted)" },
  cancelled: { background: "rgba(239,68,68,0.12)", color: "var(--danger)" },
  closed: { background: "var(--panel2)", color: "var(--muted)" },
  muted: { background: "var(--panel2)", color: "var(--muted)" },
  accent: { background: "rgba(220,38,38,0.1)", color: "var(--accent)" },
};

export default function Badge({ variant = "muted", children, style }: Props) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
