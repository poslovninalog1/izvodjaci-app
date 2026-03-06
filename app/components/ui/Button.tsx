"use client";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: React.ReactNode;
};

const styles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "#fff",
    border: "1px solid var(--accent)",
  },
  secondary: {
    background: "#ffffff",
    color: "var(--text)",
    border: "1px solid var(--border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text)",
    border: "1px solid transparent",
  },
  danger: {
    background: "var(--danger)",
    color: "#fff",
    border: "1px solid var(--danger)",
  },
};

export default function Button({ variant = "secondary", children, style, className, ...props }: Props) {
  return (
    <button
      type="button"
      className={`premium-btn ${className ?? ""}`.trim()}
      style={{
        padding: "8px 16px",
        borderRadius: "var(--radius-sm)",
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, opacity 0.15s",
        ...styles[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (variant === "primary" || variant === "danger") {
          e.currentTarget.style.background = "var(--accentHover)";
          e.currentTarget.style.borderColor = "var(--accentHover)";
        }
        if (variant === "secondary" || variant === "ghost") {
          e.currentTarget.style.background = "var(--panel2)";
        }
      }}
      onMouseLeave={(e) => {
        const s = styles[variant];
        e.currentTarget.style.background = s.background as string;
        e.currentTarget.style.borderColor = s.border as string;
      }}
      {...props}
    >
      {children}
    </button>
  );
}
