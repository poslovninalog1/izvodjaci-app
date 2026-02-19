import { ContractStatus } from "@prisma/client";

const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: [ContractStatus.PENDING_SIGNATURES, ContractStatus.CANCELLED],
  PENDING_SIGNATURES: [ContractStatus.PARTIALLY_SIGNED, ContractStatus.CANCELLED],
  PARTIALLY_SIGNED: [ContractStatus.SIGNED, ContractStatus.CANCELLED],
  SIGNED: [ContractStatus.DISPUTED],
  CANCELLED: [],
  DISPUTED: [ContractStatus.RESOLVED],
  RESOLVED: [],
};

export function canTransition(
  from: ContractStatus,
  to: ContractStatus,
): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(
  from: ContractStatus,
  to: ContractStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid status transition: ${from} → ${to}`);
  }
}

/** Terminal states that cannot change further */
export const TERMINAL: ReadonlySet<ContractStatus> = new Set([
  ContractStatus.CANCELLED,
  ContractStatus.RESOLVED,
]);

/** States where signing is allowed */
export const SIGNABLE: ReadonlySet<ContractStatus> = new Set([
  ContractStatus.PENDING_SIGNATURES,
  ContractStatus.PARTIALLY_SIGNED,
]);

export { ContractStatus };
