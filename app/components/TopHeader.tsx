"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { getDisplayName } from "@/src/lib/profile";
import { isClientForApp, ONBOARDING_STORAGE_KEY, ONBOARDING_ROLE_KEY } from "@/src/lib/onboarding";
import Logo from "./Logo";

type NavItem = { href: string; label: string; auth?: boolean; role?: "client" | "freelancer" | "admin" };

const NAV_ITEMS: NavItem[] = [
  { href: "/jobs", label: "Poslovi" },
  { href: "/inbox", label: "Inbox", auth: true },
  { href: "/contracts", label: "Ugovori", auth: true },
  { href: "/client/jobs", label: "Moji poslovi", auth: true, role: "client" },
  { href: "/freelancer/proposals", label: "Moje ponude", auth: true, role: "freelancer" },
  { href: "/admin", label: "Admin", auth: true, role: "admin" },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/" || pathname === "/start";
  if (href === "/jobs") return pathname === "/jobs" || pathname.startsWith("/jobs/");
  return pathname === href || pathname.startsWith(href + "/");
}

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

export default function TopHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, onboardingCompleted } = useAuth();
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const objaviPosaoHref = getObjaviPosaoHref(loading, user, onboardingCompleted, profile ?? null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visibleItems = NAV_ITEMS.filter((it) => {
    if (it.auth && !user) return false;
    if (it.role && profile?.role !== it.role) return false;
    return true;
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/jobs?q=${encodeURIComponent(search.trim())}`);
    } else {
      router.push("/jobs");
    }
  };

  const handleLogout = async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      localStorage.removeItem(ONBOARDING_ROLE_KEY);
    }
    const { supabase } = await import("@/src/lib/supabaseClient");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
    setDropdownOpen(false);
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "#ffffff",
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          maxWidth: 1400,
          margin: "0 auto",
          height: 56,
        }}
      >
        {/* Brand */}
        <Logo href="/jobs" size="md" />

        {/* Nav tabs (Upwork-like) */}
        <nav style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {visibleItems.map((it) => {
            const active = isActive(it.href, pathname);
            return (
              <Link
                key={it.href}
                href={it.href}
                style={{
                  padding: "8px 14px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: active ? "var(--accent)" : "var(--muted)",
                  textDecoration: "none",
                  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                  marginBottom: -1,
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 0, maxWidth: 320, marginLeft: "auto" }}>
          <input
            type="search"
            placeholder="Pretraži poslove..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="uiInput"
            style={{
              width: "100%",
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "#ffffff",
              color: "var(--text)",
              fontSize: 14,
            }}
          />
        </form>

        {/* Right: CTA or profile dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {!profile?.deactivated && (
            <Link
              href={objaviPosaoHref}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-sm)",
                background: "var(--accent)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Objavi posao
            </Link>
          )}

          {!loading &&
            (user ? (
              <div ref={dropdownRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{
                    padding: "6px 12px",
                    background: "#ffffff",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text)",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  {getDisplayName(profile) || "Profil"} ▼
                </button>
                {dropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 4,
                      background: "#ffffff",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      minWidth: 160,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                  >
                    <Link
                      href="/profil"
                      style={{
                        display: "block",
                        padding: "10px 16px",
                        color: "var(--text)",
                        fontSize: 14,
                        textDecoration: "none",
                      }}
                      onClick={() => setDropdownOpen(false)}
                    >
                      Moj profil
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "10px 16px",
                        background: "none",
                        border: "none",
                        color: "var(--text)",
                        fontSize: 14,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      Odjavi se
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  style={{
                    padding: "8px 16px",
                    color: "var(--muted)",
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  Prijavi se
                </Link>
                <Link
                  href="/register"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--accent)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  Registruj se
                </Link>
              </>
            ))}
        </div>
      </div>
    </header>
  );
}
