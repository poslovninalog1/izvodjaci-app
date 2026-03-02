"use client";

import { useAuth } from "../context/AuthContext";

export default function InboxPage() {
  const { user, loading: authLoading } = useAuth();

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden min-w-0">
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
        <p className="text-gray-500 text-center m-0 text-base">
          {authLoading || !user
            ? "Učitavanje…"
            : "Izaberi razgovor sa liste ili započni novi."}
        </p>
      </div>
    </div>
  );
}
