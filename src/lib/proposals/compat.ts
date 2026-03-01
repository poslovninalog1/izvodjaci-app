/**
 * Schema compatibility layer for proposals.
 * Works with current DB (status default 'submitted', job_id uuid) and future flow (pending/accepted/withdrawn after 00013).
 * Does not change DB values — only builds insert payload and normalizes status for UI display.
 */

/** DB status values: legacy (submitted/shortlisted/rejected/hired) vs new (pending/accepted/withdrawn/expired). */
export type ProposalDbStatus =
  | "submitted"
  | "shortlisted"
  | "rejected"
  | "hired"
  | "pending"
  | "accepted"
  | "withdrawn"
  | "expired"
  | null;

/** Normalized key for UI (badge/label). */
export type ProposalDisplayStatus =
  | "pending"   // submitted / pending
  | "shortlisted"
  | "accepted"   // hired / accepted
  | "rejected"
  | "withdrawn"
  | "expired"
  | "unknown";

/** Serbian labels for display (regardless of DB status string). */
export const PROPOSAL_STATUS_LABELS: Record<ProposalDisplayStatus, string> = {
  pending: "Poslato",
  shortlisted: "U užem izboru",
  accepted: "Angažovan",
  rejected: "Odbijeno",
  withdrawn: "Povučeno",
  expired: "Isteklo",
  unknown: "—",
};

/**
 * Normalizes raw DB status to a display key. Does not change DB.
 * submitted/pending -> pending; hired -> accepted; etc.
 */
export function normalizeProposalStatus(statusFromDb: string | null | undefined): ProposalDisplayStatus {
  if (statusFromDb == null || statusFromDb === "") return "unknown";
  const s = statusFromDb.toLowerCase().trim();
  if (s === "submitted" || s === "pending") return "pending";
  if (s === "shortlisted") return "shortlisted";
  if (s === "hired" || s === "accepted") return "accepted";
  if (s === "rejected") return "rejected";
  if (s === "withdrawn") return "withdrawn";
  if (s === "expired") return "expired";
  return "unknown";
}

/** Returns Serbian label for a raw DB status. */
export function getProposalStatusLabel(statusFromDb: string | null | undefined): string {
  return PROPOSAL_STATUS_LABELS[normalizeProposalStatus(statusFromDb)];
}

/** Status to send on INSERT. Use 'submitted' when DB has not had 00013 applied. */
export const PROPOSAL_INSERT_STATUS = "submitted" as const;

export interface BuildProposalInsertPayloadParams {
  jobId: string | number;
  userId: string;
  coverLetter: string;
  /** 'fixed' | 'hourly' from job budget_type */
  budgetType: string | null;
  /** For fixed: proposed amount (€). */
  proposedFixed?: number | null;
  /** For hourly: proposed rate (€/h). */
  proposedRate?: number | null;
  /** Optional single amount if UI only sends one (mapped to proposed_fixed or proposed_rate by budgetType). */
  amount?: number | null;
  /** Optional message (if column exists in DB). */
  message?: string | null;
}

/**
 * Builds the insert payload for public.proposals.
 * - job_id: passed as-is (string for UUID, number for bigint).
 * - freelancer_id: must be auth.uid() for RLS.
 * - Uses proposed_fixed / proposed_rate (no "price" column).
 * - status: 'submitted' for current DB (no 00013); switch to 'pending' after migration if needed.
 */
export function buildProposalInsertPayload(params: BuildProposalInsertPayloadParams): Record<string, unknown> {
  const {
    jobId,
    userId,
    coverLetter,
    budgetType,
    proposedFixed,
    proposedRate,
    amount,
    message,
  } = params;

  const isFixed = budgetType === "fixed";
  const fixedVal = proposedFixed ?? (isFixed ? amount : null);
  const rateVal = proposedRate ?? (!isFixed ? amount : null);

  const payload: Record<string, unknown> = {
    job_id: typeof jobId === "string" ? jobId : Number(jobId),
    freelancer_id: userId,
    cover_letter: coverLetter.trim(),
    proposed_fixed: fixedVal != null ? Number(fixedVal) : null,
    proposed_rate: rateVal != null ? Number(rateVal) : null,
    status: PROPOSAL_INSERT_STATUS,
  };

  if (message != null && String(message).trim() !== "") {
    payload.message = String(message).trim();
  }

  return payload;
}

/**
 * Returns display price string from proposal row (proposed_fixed, proposed_rate, or amount).
 */
export function getProposalPriceDisplay(p: {
  proposed_fixed?: number | null;
  proposed_rate?: number | null;
  amount?: number | null;
}): string {
  if (p.proposed_fixed != null) return `${p.proposed_fixed} €`;
  if (p.proposed_rate != null) return `${p.proposed_rate} €/h`;
  if (p.amount != null) return `${p.amount} €`;
  return "—";
}
