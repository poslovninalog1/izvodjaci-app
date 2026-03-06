"use client";

import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { getDisplayName } from "@/src/lib/profile";
import Card from "../components/ui/Card";

export default function JobsRightSidebar() {
  const { user, profile } = useAuth();
  const displayName = getDisplayName(profile);
  const roleLabel = profile?.active_role === "client" || profile?.role === "client" ? "Poslodavac" : "Izvođač";

  return (
    <aside className="hidden lg:block w-[280px] shrink-0 space-y-4">
      {/* Profile card */}
      <Card className="!p-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold bg-gray-200 text-gray-700 shrink-0"
            aria-hidden
          >
            {(displayName || "?").trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 truncate m-0 text-sm">{displayName || "Korisnik"}</p>
            <p className="text-xs text-gray-500 m-0">{roleLabel}</p>
          </div>
        </div>
        {user && (
          <Link
            href="/profil"
            className="mt-3 block text-center text-sm font-medium text-[var(--accent)] hover:underline py-2"
          >
            Dopuni profil
          </Link>
        )}
      </Card>

      {/* Placeholder cards */}
      <Card className="!p-4">
        <h4 className="text-sm font-semibold text-gray-700 m-0 mb-2">Verifikacija identiteta</h4>
        <p className="text-xs text-gray-500 m-0">Dostupno uskoro.</p>
      </Card>
      <Card className="!p-4">
        <h4 className="text-sm font-semibold text-gray-700 m-0 mb-2">Statistika</h4>
        <p className="text-xs text-gray-500 m-0">Pregled aktivnosti uskoro.</p>
      </Card>
    </aside>
  );
}
