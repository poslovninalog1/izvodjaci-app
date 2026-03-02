"use client";

import Link from "next/link";
import Button from "../components/ui/Button";

export type ParticipantMeta = {
  otherUserName: string;
  otherUserId: string | null;
  jobTitle: string | null;
};

type Props = {
  meta: ParticipantMeta;
  onReportClick: () => void;
};

export default function ParticipantPanel({ meta, onReportClick }: Props) {
  return (
    <div className="p-6">
      <h3 className="text-sm font-semibold text-gray-500 m-0 mb-3">Učesnik</h3>
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-base font-semibold bg-gray-100 text-gray-600 shrink-0"
          aria-hidden
        >
          {(meta.otherUserName ?? "?").trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 truncate m-0">{meta.otherUserName ?? "—"}</p>
          {meta.jobTitle && (
            <p className="text-xs text-gray-500 truncate m-0 mt-0.5">{meta.jobTitle}</p>
          )}
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col gap-2">
        {meta.otherUserId && (
          <Link
            href={`/izvodjac/${meta.otherUserId}`}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Pogledaj profil →
          </Link>
        )}
        <Button
          variant="secondary"
          onClick={onReportClick}
          className="!py-1.5 !text-xs w-full"
        >
          Prijavi razgovor
        </Button>
      </div>
    </div>
  );
}
