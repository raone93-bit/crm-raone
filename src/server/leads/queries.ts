import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";
import { leadVisibilityWhere } from "@/lib/tenant";

export type LeadFilters = {
  temp?: string;
  triage?: string;
  q?: string;
  sellerId?: string;
  stageId?: string;
  status?: "open" | "won" | "lost";
};

export const LEADS_PAGE_SIZE = 50;

function buildLeadWhere(user: CurrentUser, filters: LeadFilters): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [leadVisibilityWhere(user)];

  if (filters.temp && ["COLD", "WARM", "QUALIFIED", "HOT"].includes(filters.temp)) {
    and.push({ temperature: filters.temp as "COLD" | "WARM" | "QUALIFIED" | "HOT" });
  }
  if (filters.triage === "1") and.push({ isTriage: true });
  if (filters.sellerId) and.push({ sellerId: filters.sellerId });
  if (filters.stageId) and.push({ stageId: filters.stageId });
  if (filters.status === "won") and.push({ wonAt: { not: null } });
  else if (filters.status === "lost") and.push({ lostAt: { not: null } });
  else if (filters.status === "open") and.push({ wonAt: null, lostAt: null });
  if (filters.q) {
    and.push({
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { materialText: { contains: filters.q, mode: "insensitive" } },
        { contact: { displayName: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }
  return { AND: and };
}

/** Lista paginada (50 por página) só com as colunas que a tabela mostra. */
export async function listLeads(user: CurrentUser, filters: LeadFilters, page = 1) {
  const current = Number.isFinite(page) && page > 1 ? Math.floor(page) : 1;
  const rows = await prisma.lead.findMany({
    where: buildLeadWhere(user, filters),
    select: {
      id: true,
      title: true,
      channel: true,
      isTriage: true,
      temperature: true,
      score: true,
      squareMeters: true,
      materialText: true,
      lastContactAt: true,
      updatedAt: true,
      contact: { select: { displayName: true } },
      seller: { select: { displayName: true } },
      stage: { select: { name: true } },
      material: { select: { commercialName: true } },
    },
    orderBy: [{ temperature: "desc" }, { updatedAt: "desc" }],
    skip: (current - 1) * LEADS_PAGE_SIZE,
    take: LEADS_PAGE_SIZE + 1, // +1 só para saber se existe próxima página
  });
  const hasMore = rows.length > LEADS_PAGE_SIZE;
  return { rows: hasMore ? rows.slice(0, LEADS_PAGE_SIZE) : rows, page: current, hasMore };
}

/** Funil (kanban): só os campos do cartão. */
export async function listBoardLeads(user: CurrentUser, filters: LeadFilters) {
  return prisma.lead.findMany({
    where: buildLeadWhere(user, filters),
    select: {
      id: true,
      title: true,
      stageId: true,
      temperature: true,
      score: true,
      materialText: true,
      contact: { select: { displayName: true } },
      seller: { select: { displayName: true } },
      material: { select: { commercialName: true } },
    },
    orderBy: [{ temperature: "desc" }, { updatedAt: "desc" }],
    take: 300,
  });
}

export async function getLead(user: CurrentUser, id: string) {
  return prisma.lead.findFirst({
    where: { id, ...leadVisibilityWhere(user) },
    include: {
      contact: { include: { identities: true, customer: true } },
      company: true,
      seller: { include: { user: true } },
      stage: true,
      material: true,
      funnel: { include: { stages: { orderBy: { position: "asc" } } } },
      scoreFactors: true,
      stageEvents: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: true },
        take: 40,
      },
      followUps: { orderBy: { dueAt: "asc" }, where: { status: "OPEN" } },
    },
  });
}

export async function leadTimeline(organizationId: string, leadId: string, contactId: string) {
  return prisma.activity.findMany({
    where: {
      organizationId,
      OR: [
        { subjectType: "lead", subjectId: leadId },
        { subjectType: "contact", subjectId: contactId },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { actorUser: true },
    take: 60,
  });
}
