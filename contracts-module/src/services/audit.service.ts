import type { PrismaClient, Prisma } from "@prisma/client";

export const AuditAction = {
  CREATED: "CONTRACT_CREATED",
  STATUS_CHANGED: "STATUS_CHANGED",
  PDF_GENERATED: "PDF_GENERATED",
  OTP_REQUESTED: "OTP_REQUESTED",
  OTP_VERIFIED: "OTP_VERIFIED",
  OTP_FAILED: "OTP_FAILED",
  SIGNED: "SIGNED",
  FINALIZED: "FINALIZED",
  CANCELLED: "CANCELLED",
  DISPUTE_OPENED: "DISPUTE_OPENED",
  DISPUTE_RESOLVED: "DISPUTE_RESOLVED",
  AMENDMENT_CREATED: "AMENDMENT_CREATED",
  AMENDMENT_SIGNED: "AMENDMENT_SIGNED",
  PDF_DOWNLOADED: "PDF_DOWNLOADED",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  /** Append-only log entry. Never updates or deletes. */
  async log(
    contractId: string,
    action: AuditActionType,
    actorId: string | null,
    metadata?: Record<string, unknown> | null,
    ipAddress?: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await (client as PrismaClient).contractAuditLog.create({
      data: {
        contractId,
        action,
        actorId,
        metadata: metadata ?? undefined,
        ipAddress: ipAddress ?? undefined,
      },
    });
  }
}
