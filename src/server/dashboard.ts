import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";
import { seesAllSellers } from "@/lib/rbac";
import { getStages, getSellers } from "@/lib/cached";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

type LeadTiles = {
  leadsToday: number;
  leadsWeek: number;
  hotLeads: number;
  wonThisMonth: number;
  triageCount: number;
};
type GroupRow = { dim: string; k: string | null; n: number };
type OtherTiles = { openConversations: number; overdueFollowUps: number; openQuotes: number };

/**
 * Antes: 16 consultas por abertura do dashboard. Agora: 3 (em paralelo) +
 * etapas/vendedores vindos do cache. Cada consulta paga a ida e volta até o
 * banco, então menos consultas = tela mais rápida.
 */
export async function getDashboard(user: CurrentUser) {
  const orgId = user.organizationId;
  const all = seesAllSellers(user.role);
  const now = new Date();
  const today = startOfToday();
  const week = new Date(Date.now() - 7 * 864e5);
  const month = startOfMonth();

  // Vendedor só enxerga os próprios leads (mesma regra de leadVisibilityWhere).
  const vis = all
    ? Prisma.sql`"organizationId" = ${orgId}`
    : Prisma.sql`"organizationId" = ${orgId} AND ("sellerId" = ${user.sellerId ?? "__none__"} OR "ownerUserId" = ${user.id})`;
  const convVis = all
    ? Prisma.empty
    : Prisma.sql`AND ("assignedSellerId" = ${user.sellerId ?? "__none__"} OR "assignedUserId" = ${user.id})`;
  const userVis = (col: string) => (all ? Prisma.empty : Prisma.sql`AND ${Prisma.raw(`"${col}"`)} = ${user.id}`);

  const [tilesRows, groupRows, otherRows, stages, sellers] = await Promise.all([
    prisma.$queryRaw<LeadTiles[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "createdAt" >= ${today})::int AS "leadsToday",
        COUNT(*) FILTER (WHERE "createdAt" >= ${week})::int AS "leadsWeek",
        COUNT(*) FILTER (WHERE temperature = 'HOT' AND "lostAt" IS NULL AND "wonAt" IS NULL)::int AS "hotLeads",
        COUNT(*) FILTER (WHERE "wonAt" >= ${month})::int AS "wonThisMonth",
        COUNT(*) FILTER (WHERE "isTriage" AND "wonAt" IS NULL AND "lostAt" IS NULL)::int AS "triageCount"
      FROM "Lead" WHERE ${vis}`),
    prisma.$queryRaw<GroupRow[]>(Prisma.sql`
      SELECT 'stage' AS dim, "stageId" AS k, COUNT(*)::int AS n
        FROM "Lead" WHERE ${vis} AND "lostAt" IS NULL GROUP BY "stageId"
      UNION ALL
      SELECT 'channel', channel::text, COUNT(*)::int FROM "Lead" WHERE ${vis} GROUP BY channel
      UNION ALL
      SELECT 'language', language::text, COUNT(*)::int FROM "Lead" WHERE ${vis} GROUP BY language
      ${
        all
          ? Prisma.sql`UNION ALL SELECT 'seller', "sellerId", COUNT(*)::int FROM "Lead" WHERE ${vis} GROUP BY "sellerId"`
          : Prisma.empty
      }`),
    prisma.$queryRaw<OtherTiles[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "Conversation"
          WHERE "organizationId" = ${orgId} AND status IN ('OPEN', 'PENDING') ${convVis}) AS "openConversations",
        (SELECT COUNT(*)::int FROM "FollowUp"
          WHERE "organizationId" = ${orgId} AND status = 'OPEN' AND "dueAt" < ${now} ${userVis("assigneeUserId")}) AS "overdueFollowUps",
        (SELECT COUNT(*)::int FROM "Quote"
          WHERE "organizationId" = ${orgId} AND status IN ('DRAFT', 'SENT') ${userVis("ownerUserId")}) AS "openQuotes"`),
    getStages(orgId),
    all ? getSellers(orgId) : Promise.resolve([]),
  ]);

  const t = tilesRows[0] ?? { leadsToday: 0, leadsWeek: 0, hotLeads: 0, wonThisMonth: 0, triageCount: 0 };
  const o = otherRows[0] ?? { openConversations: 0, overdueFollowUps: 0, openQuotes: 0 };
  const dim = (d: string) => groupRows.filter((r) => r.dim === d);

  const stageCounts = stages.map((s) => ({
    name: s.name,
    count: dim("stage").find((r) => r.k === s.id)?.n ?? 0,
    isWon: s.isWon,
    isLost: s.isLost,
  }));

  return {
    tiles: {
      leadsToday: t.leadsToday,
      leadsWeek: t.leadsWeek,
      hotLeads: t.hotLeads,
      openConversations: o.openConversations,
      overdueFollowUps: o.overdueFollowUps,
      openQuotes: o.openQuotes,
      wonThisMonth: t.wonThisMonth,
      triageCount: t.triageCount,
    },
    stageCounts,
    byChannel: dim("channel").map((r) => ({ label: r.k ?? "—", count: r.n })),
    byLanguage: dim("language").map((r) => ({ label: r.k ?? "—", count: r.n })),
    bySeller: sellers.map((s) => ({
      name: s.displayName,
      count: dim("seller").find((r) => r.k === s.id)?.n ?? 0,
    })),
  };
}
