import { prisma } from "@/lib/prisma";

/**
 * Reativação automática (item 36).
 * Identifica leads parados e cria uma tarefa de follow-up para o vendedor.
 * NÃO envia mensagem automática — só recomenda a ação (item 41).
 */

const QUOTE_SILENCE_DAYS = Number(process.env.REACTIVATION_QUOTE_DAYS ?? "5");
const NO_CONTACT_DAYS = Number(process.env.REACTIVATION_NO_CONTACT_DAYS ?? "10");

export type ReactivationSummary = { quoteFollowUps: number; staleFollowUps: number };

async function hasOpenFollowUp(leadId: string) {
  const count = await prisma.followUp.count({ where: { leadId, status: "OPEN" } });
  return count > 0;
}

async function createFollowUp(params: {
  organizationId: string;
  leadId: string;
  assigneeUserId: string | null;
  reason: string;
  title: string;
}) {
  const due = new Date();
  due.setHours(due.getHours() + 4);

  await prisma.$transaction([
    prisma.followUp.create({
      data: {
        organizationId: params.organizationId,
        leadId: params.leadId,
        assigneeUserId: params.assigneeUserId ?? undefined,
        trigger: "AI",
        reason: params.reason,
        dueAt: due,
      },
    }),
    prisma.task.create({
      data: {
        organizationId: params.organizationId,
        leadId: params.leadId,
        assigneeUserId: params.assigneeUserId ?? undefined,
        type: "FOLLOW_UP",
        title: params.title,
        note: params.reason,
        dueAt: due,
      },
    }),
    prisma.lead.update({ where: { id: params.leadId }, data: { nextFollowUpAt: due } }),
    prisma.activity.create({
      data: {
        organizationId: params.organizationId,
        actorType: "SYSTEM",
        verb: "reactivation",
        subjectType: "lead",
        subjectId: params.leadId,
        summary: params.reason,
      },
    }),
  ]);
}

export async function runReactivation(): Promise<ReactivationSummary> {
  const summary: ReactivationSummary = { quoteFollowUps: 0, staleFollowUps: 0 };
  const now = Date.now();

  // 1. Cotação enviada e sem resposta do cliente há N dias.
  const silentQuotes = await prisma.quote.findMany({
    where: {
      status: "SENT",
      sentAt: { lt: new Date(now - QUOTE_SILENCE_DAYS * 86_400_000) },
      leadId: { not: null },
      lead: { is: { wonAt: null, lostAt: null } },
    },
    include: { lead: { include: { contact: true } } },
    take: 200,
  });

  for (const q of silentQuotes) {
    if (!q.lead || !q.sentAt) continue;
    // Houve mensagem de entrada do contato depois da cotação?
    const reply = await prisma.message.findFirst({
      where: {
        organizationId: q.organizationId,
        direction: "INBOUND",
        createdAt: { gt: q.sentAt },
        conversation: { contactId: q.lead.contactId },
      },
    });
    if (reply) continue;
    if (await hasOpenFollowUp(q.leadId!)) continue;

    await createFollowUp({
      organizationId: q.organizationId,
      leadId: q.leadId!,
      assigneeUserId: q.lead.ownerUserId ?? null,
      reason: `Cotação ${q.number} enviada há ${QUOTE_SILENCE_DAYS}+ dias sem resposta do cliente.`,
      title: `Reativar: ${q.lead.contact.displayName} — cotação sem retorno`,
    });
    summary.quoteFollowUps += 1;
  }

  // 2. Lead morno/quente sem contato há N dias e sem tarefa aberta.
  const staleLeads = await prisma.lead.findMany({
    where: {
      wonAt: null,
      lostAt: null,
      temperature: { in: ["WARM", "QUALIFIED", "HOT"] },
      lastContactAt: { lt: new Date(now - NO_CONTACT_DAYS * 86_400_000) },
      nextFollowUpAt: null,
    },
    include: { contact: true },
    take: 200,
  });

  for (const lead of staleLeads) {
    const openTasks = await prisma.task.count({ where: { leadId: lead.id, status: "OPEN" } });
    if (openTasks > 0) continue;
    if (await hasOpenFollowUp(lead.id)) continue;

    await createFollowUp({
      organizationId: lead.organizationId,
      leadId: lead.id,
      assigneeUserId: lead.ownerUserId ?? null,
      reason: `Sem contato há ${NO_CONTACT_DAYS}+ dias — lead ${lead.temperature.toLowerCase()}.`,
      title: `Reativar: ${lead.contact.displayName}`,
    });
    summary.staleFollowUps += 1;
  }

  return summary;
}
