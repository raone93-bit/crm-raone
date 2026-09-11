import { prisma } from "@/lib/prisma";
import {
  CHANNEL_LABEL,
  LANGUAGE_LABEL,
  LOST_REASON_LABEL,
  MATERIAL_TYPE_LABEL,
} from "@/lib/labels";

type Range = { since: Date };

function rangeFrom(period: string): Range {
  const d = new Date();
  if (period === "7d") d.setDate(d.getDate() - 7);
  else if (period === "90d") d.setDate(d.getDate() - 90);
  else if (period === "year") d.setMonth(0, 1);
  else d.setDate(d.getDate() - 30); // 30d padrão
  d.setHours(0, 0, 0, 0);
  return { since: d };
}

export async function getReports(organizationId: string, period: string) {
  const { since } = rangeFrom(period);
  const where = { organizationId, createdAt: { gte: since } };

  const [
    totalLeads,
    wonLeads,
    lostLeads,
    bySeller,
    byChannel,
    byLanguage,
    byMaterial,
    byCountry,
    lostReasons,
    quotesAgg,
    ordersAgg,
    sellers,
  ] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { organizationId, wonAt: { gte: since } } }),
    prisma.lead.count({ where: { organizationId, lostAt: { gte: since } } }),
    prisma.lead.groupBy({ by: ["sellerId"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["channel"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["language"], where, _count: { _all: true } }),
    prisma.lead.groupBy({
      by: ["stoneType"],
      where: { ...where, stoneType: { not: null } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["market"],
      where: { ...where, market: { not: null } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["lostReason"],
      where: { organizationId, lostAt: { gte: since }, lostReason: { not: null } },
      _count: { _all: true },
    }),
    prisma.quote.aggregate({
      where: { organizationId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { organizationId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.seller.findMany({ where: { organizationId } }),
  ]);

  // Materiais mais procurados (por texto livre, quando não há stoneType).
  const materialTextRows = await prisma.lead.groupBy({
    by: ["materialText"],
    where: { ...where, materialText: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { materialText: "desc" } },
    take: 8,
  });

  // Tempo médio até cotação e até venda (dias).
  const convertedQuotes = await prisma.quote.findMany({
    where: { organizationId, sentAt: { gte: since }, leadId: { not: null } },
    select: { sentAt: true, lead: { select: { createdAt: true } } },
  });
  const wonWithDates = await prisma.lead.findMany({
    where: { organizationId, wonAt: { gte: since } },
    select: { createdAt: true, wonAt: true },
  });

  const avgDays = (pairs: { a: Date | null; b: Date | null }[]) => {
    const vals = pairs
      .filter((p) => p.a && p.b)
      .map((p) => (p.b!.getTime() - p.a!.getTime()) / 86_400_000)
      .filter((n) => n >= 0);
    return vals.length ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10 : null;
  };

  const sellerName = (id: string | null) => sellers.find((s) => s.id === id)?.displayName ?? "Sem vendedor";

  const conversion = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 1000) / 10 : 0;
  const ticket = ordersAgg._count._all > 0 ? (ordersAgg._sum.total ?? 0) / ordersAgg._count._all : 0;

  return {
    period,
    since,
    tiles: {
      totalLeads,
      wonLeads,
      lostLeads,
      conversion,
      quotes: quotesAgg._count._all,
      quotesValue: quotesAgg._sum.total ?? 0,
      orders: ordersAgg._count._all,
      ordersValue: ordersAgg._sum.total ?? 0,
      ticket,
      timeToQuote: avgDays(convertedQuotes.map((q) => ({ a: q.lead?.createdAt ?? null, b: q.sentAt }))),
      timeToWon: avgDays(wonWithDates.map((l) => ({ a: l.createdAt, b: l.wonAt }))),
    },
    bySeller: bySeller
      .map((r) => ({ label: sellerName(r.sellerId), count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    byChannel: byChannel.map((r) => ({ label: CHANNEL_LABEL[r.channel] ?? r.channel, count: r._count._all })),
    byLanguage: byLanguage.map((r) => ({ label: LANGUAGE_LABEL[r.language] ?? r.language, count: r._count._all })),
    byMaterial: [
      ...byMaterial.map((r) => ({
        label: MATERIAL_TYPE_LABEL[r.stoneType ?? ""] ?? r.stoneType ?? "—",
        count: r._count._all,
      })),
      ...materialTextRows.map((r) => ({ label: r.materialText ?? "—", count: r._count._all })),
    ]
      .reduce<{ label: string; count: number }[]>((acc, cur) => {
        const hit = acc.find((x) => x.label.toLowerCase() === cur.label.toLowerCase());
        if (hit) hit.count += cur.count;
        else acc.push({ ...cur });
        return acc;
      }, [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    byCountry: byCountry
      .map((r) => ({ label: r.market ?? "—", count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    lostReasons: lostReasons
      .map((r) => ({ label: LOST_REASON_LABEL[r.lostReason ?? ""] ?? r.lostReason ?? "—", count: r._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}
