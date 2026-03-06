"use client";

import { usePathname } from "next/navigation";

export default function GlobalContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isInbox = pathname?.startsWith("/inbox");
  return (
    <main
      className={isInbox ? "content-outer content-outer--inbox" : "content-outer"}
    >
      <div className="content">{children}</div>
    </main>
  );
}
