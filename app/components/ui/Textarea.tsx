"use client";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export default function Textarea({ style, className, ...props }: Props) {
  return (
    <textarea
      className={`uiInput ${className || ""}`.trim()}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "#ffffff",
        color: "var(--text)",
        fontSize: 14,
        resize: "vertical",
        ...style,
      }}
      {...props}
    />
  );
}
