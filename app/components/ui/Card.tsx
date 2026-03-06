"use client";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

export default function Card({ children, className, style, ...props }: Props) {
  return (
    <div
      className={`premium-surface premium-surface-tilt ${className ?? ""}`.trim()}
      style={{
        background: "#ffffff",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 20,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
