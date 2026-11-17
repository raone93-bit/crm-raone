import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getSellers } from "@/lib/cached";
import {
  CHANNEL_LABEL,
  LANGUAGE_LABEL,
  LOST_REASON_LABEL,
  MATERIAL_TYPE_LABEL,
} from "@/lib/labels";

function sinceFrom(period: string): Date {
  const d = new Date();
  if (period === "7d") d.setDate(d.getDate() - 7);
  else if (period === "90d") d.setDate(d.getDate() - 90);
  else if (period === "year") d.setMonth(0, 1);
  else d.setDate(d.getDate() - 30); // 30d padrão
  d.setHours(0, 0, 0, 0);
  return d;
}

type LeadTiles = {
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  avgDaysToWon: number | null;
};
type GroupRow = { dim: string; k: string | null; n: number };
type SalesTiles = {
  quotes: number;
  quotesValue: number;
  orders: number;
  ordersValue: number;
  timeToQuote: number | null;
};

const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

/**
 * Antes: ~17 consultas por abertura. Agora: 3 em paralelo (+ vendedores do
 * cache). Mesmo resultado, uma fração das idas e voltas ao banco.
 */
export async function getReports(organizationId: string, period: string) {
  const since = sinceFrom(period);

  const [tilesRows, groupRows, salesRows, sellers] = await Promise.all([
    prisma.$queryRaw<LeadTiles[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "createdAt" >= ${since})::int AS "totalLeads",
        COUNT(*) FILTER (WHERE "wonAt" >= ${since})::int AS "wonLeads",
        COUNT(*) FILTER (WHERE "lostAt" >= ${since})::int AS "lostLeads",
        (AVG(EXTRACT(EPOCH FROM ("wonAt" - "createdAt")) / 86400)
          FILTER (WHERE "wonAt" >= ${since} AND "wonAt" >= "createdAt"))::float8 AS "avgDaysToWon"
      FROM "Lead" WHERE "organizationId" = ${organizationId}`),
    prisma.$queryRaw<GroupRow[]>(Prisma.sql`
      SELECT 'seller' AS dim, "sellerId" AS k, COUNT(*)::int AS n
        FROM "Lead" WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since} GROUP BY "sellerId"
      UNION ALL
      SELECT 'channel', channel::text, COUNT(*)::int
        FROM "Lead" WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since} GROUP BY channel
      UNION ALL
      SELECT 'language', language::text, COUNT(*)::int
        FROM "Lead" WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since} GROUP BY language
      UNION ALL
      SELECT 'stone', "stoneType"::text, COUNT(*)::int
        FROM "Lead" WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since} AND "stoneType" IS NOT NULL GROUP BY "stoneType"
      UNION ALL
      SELECT 'market', market::text, COUNT(*)::int
        FROM "Lead" WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since} AND market IS NOT NULL GROUP BY market
      UNION ALL
      SELECT 'lost', "lostReason"::text, COUNT(*)::int
        FROM "Lead" WHERE "organizationId" = ${organizationId} AND "lostAt" >= ${since} AND "lostReason" IS NOT NULL GROUP BY "lostReason"
      UNION ALL
      (SELECT 'materialText', "materialText", COUNT(*)::int
        FROM "Lead" WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since} AND "materialText" IS NOT NULL
        GROUP BY "materialText" ORDER BY COUNT(*) DESC LIMIT 8)`),
    prisma.$queryRaw<SalesTiles[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "Quote" WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since}) AS "quotes",
        (SELECT COALESCE(SUM(total), 0)::float8 FROM "Quote" WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since}) AS "quotesValue",
        (SELECT COUNT(*)::int FROM "Order" WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since}) AS "orders",
        (SELECT COALESCE(SUM(total), 0)::float8 FROM "Order" WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since}) AS "ordersValue",
        (SELECT AVG(EXTRACT(EPOCH FROM (q."sentAt" - l."createdAt")) / 86400)::float8
           FROM "Quote" q JOIN "Lead" l ON l.id = q."leadId"
          WHERE q."organizationId" = ${organizationId} AND q."sentAt" >= ${since} AND q."sentAt" >= l."createdAt") AS "timeToQuote"`),
    getSellers(organizationId),
  ]);

  const t = tilesRows[0] ?? { totalLeads: 0, wonLeads: 0, lostLeads: 0, avgDaysToWon: null };
  const s = salesRows[0] ?? { quotes: 0, quotesValue: 0, orders: 0, ordersValue: 0, timeToQuote: null };
  const dim = (d: string) => groupRows.filter((r) => r.dim === d);

  const sellerName = (id: string | null) => sellers.find((x) => x.id === id)?.displayName ?? "Sem vendedor";
  const conversion = t.totalLeads > 0 ? Math.round((t.wonLeads / t.totalLeads) * 1000) / 10 : 0;
  const ticket = s.orders > 0 ? s.ordersValue / s.orders : 0;

  const materialMerged = [
    ...dim("stone").map((r) => ({ label: MATERIAL_TYPE_LABEL[r.k ?? ""] ?? r.k ?? "—", count: r.n })),
    ...dim("materialText").map((r) => ({ label: r.k ?? "—", count: r.n })),
  ]
    .reduce<{ label: string; count: number }[]>((acc, cur) => {
      const hit = acc.find((x) => x.label.toLowerCase() === cur.label.toLowerCase());
      if (hit) hit.count += cur.count;
      else acc.push({ ...cur });
      return acc;
    }, [])
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    period,
    since,
    tiles: {
      totalLeads: t.totalLeads,
      wonLeads: t.wonLeads,
      lostLeads: t.lostLeads,
      conversion,
      quotes: s.quotes,
      quotesValue: s.quotesValue,
      orders: s.orders,
      ordersValue: s.ordersValue,
      ticket,
      timeToQuote: round1(s.timeToQuote),
      timeToWon: round1(t.avgDaysToWon),
    },
    bySeller: dim("seller")
      .map((r) => ({ label: sellerName(r.k), count: r.n }))
      .sort((a, b) => b.count - a.count),
    byChannel: dim("channel").map((r) => ({ label: CHANNEL_LABEL[r.k ?? ""] ?? r.k ?? "—", count: r.n })),
    byLanguage: dim("language").map((r) => ({ label: LANGUAGE_LABEL[r.k ?? ""] ?? r.k ?? "—", count: r.n })),
    byMaterial: materialMerged,
    byCountry: dim("market")
      .map((r) => ({ label: r.k ?? "—", count: r.n }))
      .sort((a, b) => b.count - a.count),
    lostReasons: dim("lost")
      .map((r) => ({ label: LOST_REASON_LABEL[r.k ?? ""] ?? r.k ?? "—", count: r.n }))
      .sort((a, b) => b.count - a.count),
  };
}
