"use client";

/**
 * Optional wrapper for premium 3D interaction when not using Card/Button.
 * Use the global classes (premium-surface, premium-surface-sm, premium-btn, premium-panel)
 * directly on elements when possible; use this component when you need a wrapper.
 */
type Variant = "surface" | "surface-sm" | "panel";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  tilt?: boolean;
  children: React.ReactNode;
  as?: "div" | "span";
};

const variantClass: Record<Variant, string> = {
  surface: "premium-surface",
  "surface-sm": "premium-surface-sm",
  panel: "premium-panel",
};

export default function PremiumSurface({
  variant = "surface",
  tilt = false,
  children,
  className,
  as: Tag = "div",
  ...props
}: Props) {
  const classes = [variantClass[variant], tilt && variant === "surface" ? "premium-surface-tilt" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes || undefined} {...props}>
      {children}
    </Tag>
  );
}
