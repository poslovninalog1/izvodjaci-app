"use client";

import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";

export type FeedFilter = "pregled" | "top" | "novo";

type Community = { id: string; name: string };

type Props = {
  activeFilter: FeedFilter;
  onFilterChange: (f: FeedFilter) => void;
  onNewPost: () => void;
  communities: Community[];
  onCreateCommunity: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

export default function CommunitySidebar({
  activeFilter,
  onFilterChange,
  onNewPost,
  communities,
  onCreateCommunity,
  mobileOpen,
  onCloseMobile,
}: Props) {
  const { user } = useAuth();

  const navItems: { key: FeedFilter; label: string }[] = [
    { key: "pregled", label: "Pregled" },
    { key: "top", label: "Top" },
    { key: "novo", label: "Novo" },
  ];

  const content = (
    <>
      <nav className="flex flex-col gap-0.5 mb-4">
        {navItems.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              onFilterChange(key);
              onCloseMobile?.();
            }}
            className={`premium-menu-item w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
              activeFilter === key ? "bg-red-50 text-red-700 border border-red-200" : "text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {user && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => {
              onNewPost();
              onCloseMobile?.();
            }}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 premium-btn"
            title="Nova objava"
            aria-label="Nova objava"
          >
            <span className="text-xl leading-none">+</span>
          </button>
        </div>
      )}

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Zajednice
        </h4>
        <ul className="space-y-0.5 mb-3">
          {communities.map((c) => (
            <li key={c.id}>
              <Link
                href={`/community?community=${encodeURIComponent(c.id)}`}
                className="premium-menu-item block px-3 py-2 rounded-lg text-sm text-gray-700"
                onClick={() => onCloseMobile?.()}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
        <Button variant="secondary" className="w-full" onClick={onCreateCommunity}>
          Kreiraj zajednicu
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && onCloseMobile && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          role="presentation"
          aria-hidden
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`
          w-[260px] shrink-0 flex flex-col bg-white border-r border-gray-200 rounded-r-xl overflow-hidden
          lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:border-r lg:rounded-none
          ${mobileOpen ? "fixed left-0 top-16 bottom-0 z-40 shadow-xl" : "hidden lg:flex"}
        `}
      >
        <div className="p-4 overflow-y-auto">{content}</div>
      </aside>
    </>
  );
}
