import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type SellerStatRow = {
  open: number;
  hot: number;
  wonMonth: number;
  lostMonth: number;
  noFollowUp: number;
  overdue: number;
};

type LeadAgg = Omit<SellerStatRow, "overdue"> & { sellerId: string };
type FollowAgg = { assigneeUserId: string | null; n: number };

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Antes: 6 consultas POR vendedor (4 vendedores = 24 idas ao banco).
 * Agora: 2 consultas no total, agrupadas por vendedor.
 */
export async function getSellerStats(
  organizationId: string,
  sellers: { id: string; userId: string }[],
): Promise<Map<string, SellerStatRow>> {
  const month = startOfMonth();
  const now = new Date();

  const [leadRows, followRows] = await Promise.all([
    prisma.$queryRaw<LeadAgg[]>(Prisma.sql`
      SELECT "sellerId",
        COUNT(*) FILTER (WHERE "wonAt" IS NULL AND "lostAt" IS NULL)::int AS "open",
        COUNT(*) FILTER (WHERE temperature = 'HOT' AND "wonAt" IS NULL AND "lostAt" IS NULL)::int AS "hot",
        COUNT(*) FILTER (WHERE "wonAt" >= ${month})::int AS "wonMonth",
        COUNT(*) FILTER (WHERE "lostAt" >= ${month})::int AS "lostMonth",
        COUNT(*) FILTER (WHERE "wonAt" IS NULL AND "lostAt" IS NULL AND "nextFollowUpAt" IS NULL)::int AS "noFollowUp"
      FROM "Lead"
      WHERE "organizationId" = ${organizationId} AND "sellerId" IS NOT NULL
      GROUP BY "sellerId"`),
    prisma.$queryRaw<FollowAgg[]>(Prisma.sql`
      SELECT "assigneeUserId", COUNT(*)::int AS n
      FROM "FollowUp"
      WHERE "organizationId" = ${organizationId} AND status = 'OPEN' AND "dueAt" < ${now}
      GROUP BY "assigneeUserId"`),
  ]);

  const out = new Map<string, SellerStatRow>();
  for (const s of sellers) {
    const l = leadRows.find((r) => r.sellerId === s.id);
    out.set(s.id, {
      open: l?.open ?? 0,
      hot: l?.hot ?? 0,
      wonMonth: l?.wonMonth ?? 0,
      lostMonth: l?.lostMonth ?? 0,
      noFollowUp: l?.noFollowUp ?? 0,
      overdue: followRows.find((r) => r.assigneeUserId === s.userId)?.n ?? 0,
    });
  }
  return out;
}
