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

export async function listLeads(user: CurrentUser, filters: LeadFilters) {
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

  return prisma.lead.findMany({
    where: { AND: and },
    include: {
      contact: true,
      seller: true,
      stage: true,
      material: true,
    },
    orderBy: [{ temperature: "desc" }, { updatedAt: "desc" }],
    take: 200,
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
