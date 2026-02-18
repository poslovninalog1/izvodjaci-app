"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { isClientForApp } from "@/src/lib/onboarding";
import LogoutButton from "./LogoutButton";

type Item = { href: string; label: string };

const BASE_ITEMS: Item[] = [
  { href: "/", label: "Početna stranica" },
  { href: "/jobs", label: "Poslovi" },
  { href: "/iskustva", label: "Iskustva" },
  { href: "/ocjene-izvodjaca", label: "Ocjene zanatlija" },
  { href: "/ocjene-ponuda", label: "Ocjene ponuda" },
  { href: "/profil", label: "Profil" },
  { href: "/krediti", label: "Krediti i plaćanja" },
];

function getObjaviPosaoHref(
  loading: boolean,
  user: unknown,
  onboardingCompleted: boolean,
  profile: { role?: string | null } | null
): string {
  if (loading) return "/jobs/new";
  if (!user) return "/login?next=/jobs/new";
  if (!onboardingCompleted) return "/start?next=/jobs/new";
  if (!isClientForApp(profile)) return "/jobs";
  return "/jobs/new";
}

export default function SidebarTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, onboardingCompleted } = useAuth();
  const objaviPosaoHref = getObjaviPosaoHref(loading, user, onboardingCompleted, profile ?? null);

  const items = [...BASE_ITEMS].map((it) => {
    if (it.href === "/jobs" && !loading && profile?.role === "freelancer") {
      return { ...it, label: "Pronađi poslove" };
    }
    return it;
  });
  if (!loading && user) {
    items.splice(2, 0, { href: "/inbox", label: "Inbox" });
    items.splice(3, 0, { href: "/contracts", label: "Ugovori" });
  }
  if (!loading && user && profile?.role === "client") {
    items.splice(4, 0, { href: "/client/jobs", label: "Moji poslovi" });
  }
  if (!loading && user && profile?.role === "freelancer") {
    items.splice(4, 0, { href: "/freelancer/proposals", label: "Moje ponude" });
  }
  if (!loading && user && profile?.role === "admin") {
    items.splice(4, 0, { href: "/admin", label: "Admin" });
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brandTitle">Izvodjaci</div>
      </div>

      <nav className="nav">
        {items.map((it) => {
          const active =
            it.href === "/"
              ? pathname === "/" || pathname === "/start"
              : it.href === "/jobs"
                ? pathname === "/jobs" || pathname.startsWith("/jobs/")
                : it.href === "/inbox"
                  ? pathname.startsWith("/inbox")
                  : it.href === "/contracts"
                    ? pathname.startsWith("/contracts")
                    : it.href === "/client/jobs"
                      ? pathname.startsWith("/client/jobs")
                      : it.href === "/freelancer/proposals"
                        ? pathname.startsWith("/freelancer/proposals")
                        : it.href === "/admin"
                          ? pathname.startsWith("/admin")
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

        {!loading && (
          user ? (
            <LogoutButton />
          ) : (
            <>
              <Link href="/login" className="tabBtn">
                Prijavi se
              </Link>
              <Link href="/register" className="tabBtn">
                Registruj se
              </Link>
            </>
          )
        )}
      </nav>

      {!profile?.deactivated && (
        <div className="sidebarFooter">
          <Link className="linkBtn" href={objaviPosaoHref}>
            Objavi posao
          </Link>
        </div>
      )}
    </aside>
  );
}
