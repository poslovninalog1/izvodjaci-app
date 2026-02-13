"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type Item = { href: string; label: string };

const ITEMS: Item[] = [
  { href: "/", label: "Početna stranica" },
  { href: "/iskustva", label: "Iskustva" },
  { href: "/ocjene-izvodjaca", label: "Ocjene zanatlija" },
  { href: "/ocjene-ponuda", label: "Ocjene ponuda" },
  { href: "/profil", label: "Profil" },
  { href: "/krediti", label: "Krediti i plaćanja" },
];

export default function SidebarTabs() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brandTitle">Zanatlije</div>
      </div>

      <nav className="nav">
        {ITEMS.map((it) => {
          const active =
            it.href === "/"
              ? pathname === "/" || pathname === "/start"
              : pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`tabBtn ${active ? "active" : ""}`}
            >
              {it.label}
            </Link>
          );
        })}

        {/* Reset onboarding / promjena uloge */}
        <button
          className="tabBtn"
          type="button"
          onClick={() => {
            localStorage.removeItem("onboarding");
            router.push("/");
          }}
        >
          Promijeni ulogu (reset)
        </button>
      </nav>

      <div className="sidebarFooter">
        <Link className="linkBtn" href="/jobs/new">
          Objavi posao
        </Link>
      </div>
    </aside>
  );
}
