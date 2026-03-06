"use client";

type Props = React.SelectHTMLAttributes<HTMLSelectElement>;

export default function Select({ style, className, children, ...props }: Props) {
  return (
    <select
      className={`uiInput premium-focus ${className || ""}`.trim()}
      style={{
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "#ffffff",
        color: "var(--text)",
        fontSize: 14,
        minWidth: 120,
        ...style,
      }}
      {...props}
    >
      {children}
    </select>
  );
}
