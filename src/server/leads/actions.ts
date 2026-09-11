"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Language } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { leadVisibilityWhere } from "@/lib/tenant";
import { record } from "@/lib/audit";
import { routeLead } from "@/server/leads/routing";
import { detectLanguage } from "@/server/leads/language";

async function defaultFunnel(organizationId: string) {
  const funnel = await prisma.funnel.findFirst({
    where: { organizationId, isDefault: true },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  if (!funnel) throw new Error("Funil padrão não configurado. Rode o seed.");
  return funnel;
}

async function routingRules(organizationId: string) {
  const [rules, triage] = await Promise.all([
    prisma.routingRule.findMany({ where: { organizationId, active: true } }),
    prisma.seller.findFirst({ where: { organizationId, isTriageQueue: true } }),
  ]);
  return {
    rules: rules.map((r) => ({ language: r.language, sellerId: r.sellerId, active: r.active })),
    triageSellerId: triage?.id ?? null,
  };
}

const createSchema = z.object({
  contactName: z.string().min(2, "Informe o nome do contato."),
  channel: z.enum(["WHATSAPP", "INSTAGRAM", "FACEBOOK", "EMAIL", "PHONE", "MANUAL", "WEBSITE"]),
  language: z.enum(["PT", "ES", "EN", "OTHER", "AUTO"]),
  title: z.string().optional(),
  firstMessage: z.string().optional(),
  materialText: z.string().optional(),
  squareMeters: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().positive().optional(),
  ),
  country: z.string().optional(),
  city: z.string().optional(),
  sellerId: z.string().optional(),
});

export type CreateLeadState = { error?: string };

export async function createLead(
  _prev: CreateLeadState,
  formData: FormData,
): Promise<CreateLeadState> {
  const user = await requireUser();
  if (!can(user.role, "create", "lead")) return { error: "Sem permissão para criar leads." };

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const language: Language =
    d.language === "AUTO"
      ? detectLanguage(`${d.title ?? ""} ${d.firstMessage ?? ""}`).language
      : d.language;

  const funnel = await defaultFunnel(user.organizationId);
  const firstStage = funnel.stages[0];

  // Roteamento: se o usuário escolheu um vendedor, respeita; senão, por idioma.
  let sellerId = d.sellerId || null;
  let isTriage = false;
  if (!sellerId) {
    const { rules, triageSellerId } = await routingRules(user.organizationId);
    const r = routeLead(language, rules, triageSellerId);
    sellerId = r.sellerId;
    isTriage = r.isTriage;
  }

  const contact = await prisma.contact.create({
    data: {
      organizationId: user.organizationId,
      displayName: d.contactName,
      primaryLanguage: language,
      country: d.country || undefined,
      city: d.city || undefined,
      identities: {
        create: {
          organizationId: user.organizationId,
          channel: d.channel,
          externalId: `manual_${Date.now()}`,
          displayName: d.contactName,
        },
      },
    },
  });

  const lead = await prisma.lead.create({
    data: {
      organizationId: user.organizationId,
      contactId: contact.id,
      sellerId: sellerId ?? undefined,
      ownerUserId: user.role === "SELLER" ? user.id : undefined,
      funnelId: funnel.id,
      stageId: firstStage.id,
      title: d.title || `${d.contactName} — ${d.channel}`,
      sourceType: "MANUAL",
      channel: d.channel,
      language,
      materialText: d.materialText || undefined,
      squareMeters: typeof d.squareMeters === "number" ? d.squareMeters : undefined,
      isTriage,
      lastContactAt: new Date(),
      stageEvents: {
        create: {
          organizationId: user.organizationId,
          toStageId: firstStage.id,
          changedByUserId: user.id,
          actorType: "USER",
          note: "Lead criado manualmente",
        },
      },
    },
  });

  if (d.firstMessage) {
    await prisma.note.create({
      data: {
        organizationId: user.organizationId,
        subjectType: "lead",
        subjectId: lead.id,
        authorUserId: user.id,
        body: `Primeira mensagem: ${d.firstMessage}`,
      },
    });
  }

  await record(user, {
    action: "create",
    entity: "lead",
    entityId: lead.id,
    verb: "created_lead",
    summary: `Lead "${lead.title}" criado (${language})`,
  });

  revalidatePath("/leads");
  revalidatePath("/funil");
  revalidatePath("/dashboard");
  redirect(`/leads/${lead.id}`);
}

const moveSchema = z.object({
  leadId: z.string(),
  toStageId: z.string(),
});

export async function moveLeadStage(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "edit", "lead")) throw new Error("Sem permissão.");

  const { leadId, toStageId } = moveSchema.parse(Object.fromEntries(formData));

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...leadVisibilityWhere(user) },
    include: { stage: true },
  });
  if (!lead) throw new Error("Lead não encontrado.");

  const toStage = await prisma.funnelStage.findFirst({
    where: { id: toStageId, funnel: { organizationId: user.organizationId } },
  });
  if (!toStage) throw new Error("Etapa inválida.");

  if (toStage.isLost) {
    // Perda exige motivo — direciona para a ação dedicada.
    throw new Error("Para marcar como perdido, use o botão 'Marcar perdido' e informe o motivo.");
  }

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        stageId: toStage.id,
        wonAt: toStage.isWon ? new Date() : lead.wonAt,
      },
    }),
    prisma.leadStageEvent.create({
      data: {
        organizationId: user.organizationId,
        leadId: lead.id,
        fromStageId: lead.stageId,
        toStageId: toStage.id,
        changedByUserId: user.id,
        actorType: "USER",
      },
    }),
  ]);

  await record(user, {
    action: "move_stage",
    entity: "lead",
    entityId: lead.id,
    before: { stage: lead.stage.name },
    after: { stage: toStage.name },
    verb: "changed_stage",
    summary: `${lead.stage.name} → ${toStage.name}`,
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/funil");
  revalidatePath("/dashboard");
}

/** Versão chamável direto do cliente (kanban drag-and-drop). */
export async function moveLeadStageById(leadId: string, toStageId: string) {
  const fd = new FormData();
  fd.set("leadId", leadId);
  fd.set("toStageId", toStageId);
  await moveLeadStage(fd);
}

const lostSchema = z.object({
  leadId: z.string(),
  reason: z.enum([
    "PRICE", "NO_STOCK", "LEAD_TIME", "FREIGHT", "CUSTOMER_GAVE_UP",
    "PROJECT_CANCELLED", "COMPETITOR", "MATERIAL_UNAVAILABLE", "NO_RESPONSE", "OTHER",
  ]),
  note: z.string().optional(),
});

export type LostState = { error?: string };

export async function markLeadLost(_prev: LostState, formData: FormData): Promise<LostState> {
  const user = await requireUser();
  if (!can(user.role, "edit", "lead")) return { error: "Sem permissão." };

  const parsed = lostSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Selecione o motivo da perda." };
  const { leadId, reason, note } = parsed.data;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...leadVisibilityWhere(user) },
    include: { stage: true, funnel: { include: { stages: true } } },
  });
  if (!lead) return { error: "Lead não encontrado." };

  const lostStage = lead.funnel.stages.find((s) => s.isLost);
  if (!lostStage) return { error: "Funil sem etapa 'Perdido'." };

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        stageId: lostStage.id,
        lostReason: reason,
        lostNote: note || undefined,
        lostAt: new Date(),
      },
    }),
    prisma.leadStageEvent.create({
      data: {
        organizationId: user.organizationId,
        leadId: lead.id,
        fromStageId: lead.stageId,
        toStageId: lostStage.id,
        changedByUserId: user.id,
        actorType: "USER",
        note: `Perdido: ${reason}${note ? ` — ${note}` : ""}`,
      },
    }),
  ]);

  await record(user, {
    action: "lost",
    entity: "lead",
    entityId: lead.id,
    verb: "lost_lead",
    summary: `Lead perdido — ${reason}`,
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/funil");
  revalidatePath("/dashboard");
  return {};
}

const followUpSchema = z.object({
  leadId: z.string(),
  dueAt: z.string().min(1, "Informe a data."),
  reason: z.string().optional(),
});

export type FollowUpState = { error?: string; ok?: boolean };

export async function scheduleFollowUp(
  _prev: FollowUpState,
  formData: FormData,
): Promise<FollowUpState> {
  const user = await requireUser();
  const parsed = followUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { leadId, dueAt, reason } = parsed.data;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...leadVisibilityWhere(user) },
  });
  if (!lead) return { error: "Lead não encontrado." };

  const due = new Date(dueAt);
  await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: { nextFollowUpAt: due } }),
    prisma.followUp.create({
      data: {
        organizationId: user.organizationId,
        leadId: lead.id,
        assigneeUserId: lead.ownerUserId ?? user.id,
        trigger: "MANUAL",
        reason: reason || "Follow-up",
        dueAt: due,
      },
    }),
    prisma.task.create({
      data: {
        organizationId: user.organizationId,
        leadId: lead.id,
        assigneeUserId: lead.ownerUserId ?? user.id,
        type: "FOLLOW_UP",
        title: reason || `Follow-up: ${lead.title ?? "lead"}`,
        dueAt: due,
      },
    }),
  ]);

  await record(user, {
    action: "follow_up",
    entity: "lead",
    entityId: lead.id,
    verb: "scheduled_follow_up",
    summary: `Follow-up agendado para ${due.toLocaleDateString("pt-BR")}`,
  });

  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/tarefas");
  return { ok: true };
}

const assignSchema = z.object({ leadId: z.string(), sellerId: z.string() });

export async function assignLead(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "assign", "lead")) throw new Error("Sem permissão para reatribuir.");

  const { leadId, sellerId } = assignSchema.parse(Object.fromEntries(formData));
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: user.organizationId },
  });
  if (!lead) throw new Error("Lead não encontrado.");
  const seller = await prisma.seller.findFirst({
    where: { id: sellerId, organizationId: user.organizationId },
    include: { user: true },
  });
  if (!seller) throw new Error("Vendedor inválido.");

  await prisma.lead.update({
    where: { id: lead.id },
    data: { sellerId: seller.id, ownerUserId: seller.userId, isTriage: false },
  });

  await record(user, {
    action: "assign",
    entity: "lead",
    entityId: lead.id,
    verb: "assigned_lead",
    summary: `Lead atribuído a ${seller.displayName}`,
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/funil");
}
