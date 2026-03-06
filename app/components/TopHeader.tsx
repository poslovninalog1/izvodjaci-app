"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { getDisplayName } from "@/src/lib/profile";
import { isClientForApp, ONBOARDING_STORAGE_KEY, ONBOARDING_ROLE_KEY } from "@/src/lib/onboarding";
import Logo from "./Logo";
import RoleSwitcher from "./RoleSwitcher";

type NavItem = { href: string; label: string; auth?: boolean; role?: "client" | "freelancer" | "admin" };

/** Dropdown under "Poslovi": items depend on mode (Izvođač vs Poslodavac). */
function getPosloviDropdownItems(activeRole: string | null): { href: string; label: string }[] {
  const base = [
    { href: "/jobs", label: "Poslovi" },
    { href: "/jobs/saved", label: "Sačuvani poslovi" },
  ];
  if (activeRole === "freelancer") {
    return [...base, { href: "/freelancer/proposals", label: "Moje ponude" }];
  }
  return [...base, { href: "/client/jobs", label: "Moji poslovi" }];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/jobs", label: "Poslovi" },
  { href: "/community", label: "Zajednica" },
  { href: "/inbox", label: "Inbox", auth: true },
  { href: "/contracts", label: "Ugovori", auth: true },
  { href: "/freelancer/proposals", label: "Moje ponude", auth: true, role: "freelancer" },
  { href: "/admin", label: "Admin", auth: true, role: "admin" },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/" || pathname === "/start";
  if (href === "/jobs") return pathname === "/jobs" || pathname.startsWith("/jobs/");
  return pathname === href || pathname.startsWith(href + "/");
}

/** True when any of the Poslovi dropdown routes is active. */
function isPosloviDropdownActive(pathname: string) {
  return (
    pathname === "/jobs" ||
    pathname.startsWith("/jobs/") ||
    pathname === "/client/jobs" ||
    pathname.startsWith("/client/jobs/") ||
    pathname === "/freelancer/proposals" ||
    pathname.startsWith("/freelancer/proposals/")
  );
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [posloviDropdownOpen, setPosloviDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const posloviDropdownRef = useRef<HTMLDivElement>(null);

  const objaviPosaoHref = getObjaviPosaoHref(loading, user, onboardingCompleted, profile ?? null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (posloviDropdownRef.current && !posloviDropdownRef.current.contains(e.target as Node)) {
        setPosloviDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setPosloviDropdownOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const activeRole = profile?.active_role ?? profile?.role ?? null;
  const visibleItems = NAV_ITEMS.filter((it) => {
    if (it.auth && !user) return false;
    if (it.role === "admin" && profile?.role !== "admin") return false;
    if (it.role === "client" && activeRole !== "client") return false;
    if (it.role === "freelancer" && activeRole !== "freelancer") return false;
    // Moje ponude: show only in Poslovi dropdown for Izvođač, not as top-level tab
    if (it.href === "/freelancer/proposals" && it.role === "freelancer") return false;
    return true;
  });
  const posloviDropdownItems = getPosloviDropdownItems(activeRole);

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
      className="premium-header-bar"
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

        {/* Nav tabs (Upwork-like). Poslovi is a dropdown; Moji poslovi is only inside it. */}
        <nav style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {visibleItems.map((it) => {
            const active = isActive(it.href, pathname);
            const isPoslovi = it.href === "/jobs" && it.label === "Poslovi";

            if (isPoslovi) {
              const posloviActive = isPosloviDropdownActive(pathname);
              return (
                <div key="poslovi-dropdown" ref={posloviDropdownRef} style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="premium-nav-item"
                    onClick={() => setPosloviDropdownOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={posloviDropdownOpen}
                    aria-label="Poslovi - izbor"
                    style={{
                      padding: "8px 14px",
                      fontSize: 14,
                      fontWeight: 500,
                      color: posloviActive ? "var(--accent)" : "var(--muted)",
                      background: "none",
                      border: "none",
                      borderBottom: posloviActive ? "2px solid var(--accent)" : "2px solid transparent",
                      marginBottom: -1,
                      cursor: "pointer",
                      transition: "color 0.15s, border-color 0.15s",
                    }}
                  >
                    Poslovi ▼
                  </button>
                  {posloviDropdownOpen && (
                    <div
                      role="menu"
                      className="header-dropdown-panel premium-dropdown"
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        marginTop: 4,
                        background: "#ffffff",
                        minWidth: 220,
                        zIndex: 100,
                        overflow: "hidden",
                      }}
                    >
                      {posloviDropdownItems.map((item) => {
                        const itemActive = isActive(item.href, pathname);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            role="menuitem"
                            className="premium-menu-item block w-full text-left py-2 px-4 text-sm font-medium text-gray-700"
                            style={{
                              color: itemActive ? "var(--accent)" : undefined,
                            }}
                            onClick={() => setPosloviDropdownOpen(false)}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={it.href}
                href={it.href}
                className="premium-nav-item"
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

        {/* Right: role switcher, CTA, profile dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, marginLeft: "auto" }}>
          {user && <RoleSwitcher />}
          {!profile?.deactivated && (
            <Link
              href={objaviPosaoHref}
              className="premium-nav-item"
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
                  className="premium-nav-item"
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
                    className="premium-dropdown"
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 4,
                      background: "#ffffff",
                      minWidth: 160,
                      zIndex: 100,
                      overflow: "hidden",
                    }}
                  >
                    <Link
                      href="/profil"
                      className="premium-menu-item block"
                      style={{
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
                      className="premium-menu-item"
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
                  className="premium-nav-item"
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
                  className="premium-nav-item"
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
