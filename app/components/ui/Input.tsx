"use client";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export default function Input({ style, className, ...props }: Props) {
  return (
    <input
      className={`uiInput premium-focus ${className || ""}`.trim()}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "#ffffff",
        color: "var(--text)",
        fontSize: 14,
        ...style,
      }}
      {...props}
    />
  );
}
