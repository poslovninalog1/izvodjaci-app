"use client";

import Link from "next/link";

type Props = {
  href?: string;
  size?: "sm" | "md" | "lg";
};

export default function Logo({ href = "/jobs", size = "md" }: Props) {
  const sizes = { sm: 18, md: 22, lg: 26 };
  const fs = sizes[size];

  const content = (
    <span
      style={{
        fontFamily: '"Source Sans 3", -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: fs,
        fontWeight: 600,
        letterSpacing: "-0.02em",
        color: "var(--text)",
      }}
    >
      <span style={{ fontWeight: 700 }}>izvo</span>
      <span style={{ fontWeight: 500, color: "var(--accent)" }}>đači</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none" }}>
        {content}
      </Link>
    );
  }

  return content;
}
