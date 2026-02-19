import type { PrismaClient } from "@prisma/client";

/**
 * Generates a human-friendly contract number: CTR-YYYYMMDD-XXXX
 * Uses a PostgreSQL advisory lock to serialize number generation.
 */
export async function generateContractNumber(
  prisma: PrismaClient,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // Advisory lock scoped to this transaction — key 738201 is arbitrary but fixed
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(738201)");

    const now = new Date();
    const dateStr =
      String(now.getFullYear()) +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");

    const prefix = `CTR-${dateStr}-`;

    const rows = await tx.$queryRawUnsafe<{ cnt: bigint }[]>(
      `SELECT COUNT(*) AS cnt FROM ctm_contracts WHERE contract_number LIKE $1`,
      `${prefix}%`,
    );

    const next = Number(rows[0]?.cnt ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
  });
}
