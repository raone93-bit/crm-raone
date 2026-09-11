import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";
import { leadVisibilityWhere } from "@/lib/tenant";
import { seesAllSellers } from "@/lib/rbac";

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

export async function getDashboard(user: CurrentUser) {
  const where = leadVisibilityWhere(user);
  const orgId = user.organizationId;

  const [
    leadsToday,
    leadsWeek,
    hotLeads,
    openConversations,
    overdueFollowUps,
    openQuotes,
    wonThisMonth,
    byStage,
    byChannel,
    byLanguage,
    bySeller,
    triageCount,
  ] = await Promise.all([
    prisma.lead.count({ where: { ...where, createdAt: { gte: startOfToday() } } }),
    prisma.lead.count({
      where: { ...where, createdAt: { gte: new Date(Date.now() - 7 * 864e5) } },
    }),
    prisma.lead.count({
      where: { ...where, temperature: "HOT", lostAt: null, wonAt: null },
    }),
    prisma.conversation.count({
      where: seesAllSellers(user.role)
        ? { organizationId: orgId, status: { in: ["OPEN", "PENDING"] } }
        : {
            organizationId: orgId,
            status: { in: ["OPEN", "PENDING"] },
            OR: [{ assignedSellerId: user.sellerId ?? "__none__" }, { assignedUserId: user.id }],
          },
    }),
    prisma.followUp.count({
      where: {
        organizationId: orgId,
        status: "OPEN",
        dueAt: { lt: new Date() },
        ...(seesAllSellers(user.role) ? {} : { assigneeUserId: user.id }),
      },
    }),
    prisma.quote.count({
      where: {
        organizationId: orgId,
        status: { in: ["DRAFT", "SENT"] },
        ...(seesAllSellers(user.role) ? {} : { ownerUserId: user.id }),
      },
    }),
    prisma.lead.count({ where: { ...where, wonAt: { gte: startOfMonth() } } }),
    prisma.lead.groupBy({
      by: ["stageId"],
      where: { ...where, lostAt: null },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({ by: ["channel"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["language"], where, _count: { _all: true } }),
    seesAllSellers(user.role)
      ? prisma.lead.groupBy({ by: ["sellerId"], where, _count: { _all: true } })
      : Promise.resolve([]),
    prisma.lead.count({ where: { ...where, isTriage: true, wonAt: null, lostAt: null } }),
  ]);

  const stages = await prisma.funnelStage.findMany({
    where: { funnel: { organizationId: orgId, isDefault: true } },
    orderBy: { position: "asc" },
  });
  const sellers = seesAllSellers(user.role)
    ? await prisma.seller.findMany({ where: { organizationId: orgId } })
    : [];

  const stageCounts = stages.map((s) => ({
    name: s.name,
    count: byStage.find((b) => b.stageId === s.id)?._count._all ?? 0,
    isWon: s.isWon,
    isLost: s.isLost,
  }));

  return {
    tiles: {
      leadsToday,
      leadsWeek,
      hotLeads,
      openConversations,
      overdueFollowUps,
      openQuotes,
      wonThisMonth,
      triageCount,
    },
    stageCounts,
    byChannel: byChannel.map((c) => ({ label: c.channel, count: c._count._all })),
    byLanguage: byLanguage.map((l) => ({ label: l.language, count: l._count._all })),
    bySeller: sellers.map((s) => ({
      name: s.displayName,
      count: bySeller.find((b) => b.sellerId === s.id)?._count._all ?? 0,
    })),
  };
}
