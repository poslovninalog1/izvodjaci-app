"use client";

import { forwardRef } from "react";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { style, className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={`uiInput premium-focus ${className || ""}`.trim()}
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
});

export default Textarea;
