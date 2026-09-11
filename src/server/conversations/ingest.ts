import type { Channel, Language, Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { findDuplicate, type Candidate } from "@/server/leads/dedupe";
import { routeLead } from "@/server/leads/routing";
import { analyzeConversation } from "@/server/ai/analyze";
import { checkAvailability } from "@/server/catalog/availability";

/**
 * PIPELINE DE INGESTÃO DE MENSAGEM — o coração do CRM.
 *
 * Uma mensagem entra por aqui, venha de:
 *   - um webhook da Meta (Fase 3), ou
 *   - o simulador de entrada (admin), ou
 *   - a criação manual.
 *
 * Passos (ver documento de arquitetura, seção "Fluxo de mensagens"):
 *   1. resolve/cria o contato (com de-duplicação — item 5)
 *   2. resolve/cria a conversa
 *   3. idempotência da mensagem (externalMessageId único)
 *   4. grava a mensagem INBOUND
 *   5. qualifica: idioma + intenção comercial + extração
 *   6. se houver intenção → cria/atualiza o Lead, roteia por idioma, calcula score
 *   7. atualiza a conversa (última mensagem, não lida, vendedor)
 *   8. registra na timeline
 *
 * A IA da Fase 4 substitui `qualifyMessage`/`extractLeadFields` pela análise do
 * LLM, mantendo o mesmo contrato. NADA aqui inventa dados (item 40).
 */

export type InboundMessage = {
  organizationId: string;
  channel: Channel;
  externalContactId: string; // telefone E.164, IG user id, FB PSID
  contactName?: string | null;
  contactHandle?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
  externalThreadId?: string | null;
  externalMessageId?: string | null;
  text: string;
  type?: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  timestamp?: Date | null;
  source?: "webhook" | "simulator" | "manual";
};

export type IngestResult = {
  contactId: string;
  conversationId: string;
  messageId: string;
  leadId: string | null;
  leadCreated: boolean;
  hadCommercialIntent: boolean;
  language: Language;
  duplicateMessage: boolean;
};

const SOURCE_TYPE: Record<Channel, "INSTAGRAM" | "WHATSAPP" | "FACEBOOK" | "MANUAL"> = {
  INSTAGRAM: "INSTAGRAM",
  WHATSAPP: "WHATSAPP",
  FACEBOOK: "FACEBOOK",
  EMAIL: "MANUAL",
  PHONE: "MANUAL",
  MANUAL: "MANUAL",
  WEBSITE: "MANUAL",
};

export async function ingestInboundMessage(msg: InboundMessage): Promise<IngestResult> {
  const db: PrismaClient = prisma;
  const orgId = msg.organizationId;
  const now = msg.timestamp ?? new Date();

  // ── 3. Idempotência: essa mensagem já entrou? ────────────────────────────
  if (msg.externalMessageId) {
    const dup = await db.message.findFirst({
      where: { organizationId: orgId, channel: msg.channel, externalMessageId: msg.externalMessageId },
      include: { conversation: true },
    });
    if (dup) {
      return {
        contactId: dup.conversation.contactId,
        conversationId: dup.conversationId,
        messageId: dup.id,
        leadId: null,
        leadCreated: false,
        hadCommercialIntent: false,
        language: "OTHER",
        duplicateMessage: true,
      };
    }
  }

  // ── 1. Resolve o contato ────────────────────────────────────────────────
  let contactId: string;
  const identity = await db.contactIdentity.findUnique({
    where: {
      organizationId_channel_externalId: {
        organizationId: orgId,
        channel: msg.channel,
        externalId: msg.externalContactId,
      },
    },
  });

  if (identity) {
    contactId = identity.contactId;
  } else {
    // De-duplicação antes de criar um contato novo.
    const pool = await db.contact.findMany({
      where: { organizationId: orgId },
      include: { identities: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    const candidates: Candidate[] = pool.map((c) => ({
      contactId: c.id,
      displayName: c.displayName,
      phone: c.phone,
      email: c.email,
      country: c.country,
      lastActivityAt: c.updatedAt,
      identities: c.identities.map((i) => ({ channel: i.channel, externalId: i.externalId, handle: i.handle })),
    }));

    const match = findDuplicate(
      {
        channel: msg.channel,
        externalId: msg.externalContactId,
        handle: msg.contactHandle,
        name: msg.contactName,
        phone: msg.phone,
        email: msg.email,
        country: msg.country,
      },
      candidates,
    );

    if (match.action === "attach" && match.contactId) {
      contactId = match.contactId;
      await db.contactIdentity.create({
        data: {
          organizationId: orgId,
          contactId,
          channel: msg.channel,
          externalId: msg.externalContactId,
          handle: msg.contactHandle ?? undefined,
          displayName: msg.contactName ?? undefined,
        },
      });
      await db.activity.create({
        data: {
          organizationId: orgId,
          actorType: "SYSTEM",
          verb: "linked_channel",
          subjectType: "contact",
          subjectId: contactId,
          summary: `Canal ${msg.channel} reconhecido como mesma pessoa (${match.reason})`,
        },
      });
    } else {
      const created = await db.contact.create({
        data: {
          organizationId: orgId,
          displayName: msg.contactName?.trim() || msg.contactHandle || `Contato ${msg.channel}`,
          phone: msg.phone ?? undefined,
          email: msg.email ?? undefined,
          country: msg.country ?? undefined,
          possibleDuplicateOfId: match.action === "flag" ? match.contactId : undefined,
          duplicateConfidence: match.action === "flag" ? match.confidence : undefined,
          identities: {
            create: {
              organizationId: orgId,
              channel: msg.channel,
              externalId: msg.externalContactId,
              handle: msg.contactHandle ?? undefined,
              displayName: msg.contactName ?? undefined,
            },
          },
        },
      });
      contactId = created.id;
      await db.activity.create({
        data: {
          organizationId: orgId,
          actorType: "SYSTEM",
          verb: "created_contact",
          subjectType: "contact",
          subjectId: contactId,
          summary: `Contato criado a partir de ${msg.channel}`,
        },
      });
    }
  }

  // ── 2. Resolve a conversa ───────────────────────────────────────────────
  const threadKey = msg.externalThreadId ?? msg.externalContactId;
  let conversation = await db.conversation.findFirst({
    where: { organizationId: orgId, channel: msg.channel, externalThreadId: threadKey },
  });
  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        organizationId: orgId,
        contactId,
        channel: msg.channel,
        externalThreadId: threadKey,
        status: "OPEN",
      },
    });
  }

  // ── 4. Grava a mensagem ─────────────────────────────────────────────────
  const message = await db.message.create({
    data: {
      organizationId: orgId,
      conversationId: conversation.id,
      direction: "INBOUND",
      channel: msg.channel,
      externalMessageId: msg.externalMessageId ?? undefined,
      type: msg.type ?? "TEXT",
      text: msg.text,
      mediaUrl: msg.mediaUrl ?? undefined,
      mediaMimeType: msg.mediaMimeType ?? undefined,
      senderName: msg.contactName ?? undefined,
      status: "RECEIVED",
      externalTimestamp: now,
    },
  });

  // ── 5. Contexto + análise ──────────────────────────────────────────────
  const [rules, triage] = await Promise.all([
    db.routingRule.findMany({ where: { organizationId: orgId, active: true } }),
    db.seller.findFirst({ where: { organizationId: orgId, isTriageQueue: true } }),
  ]);

  const contextMessages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const ordered = contextMessages.slice().reverse();
  const conversationText = ordered
    .map((m) => m.text)
    .filter((t): t is string => !!t)
    .join("\n");

  const materialNames = await db.material.findMany({
    where: { organizationId: orgId, active: true },
    select: { commercialName: true },
    take: 60,
  });
  const contactRow = await db.contact.findUnique({ where: { id: contactId } });

  const analysis = await analyzeConversation(
    {
      messages: ordered
        .map((m) => ({
          role: (m.direction === "INBOUND" ? "customer" : "seller") as "customer" | "seller",
          text: m.text ?? "",
        }))
        .filter((m) => m.text),
      knownContact: {
        displayName: contactRow?.displayName ?? msg.contactName ?? null,
        country: contactRow?.country ?? msg.country ?? null,
        language: contactRow?.primaryLanguage ?? null,
      },
      catalogHints: materialNames.map((m) => m.commercialName),
    },
    { latestText: conversationText || msg.text },
  );

  const routing = analysis.hasCommercialIntent
    ? routeLead(
        analysis.language,
        rules.map((r) => ({ language: r.language, sellerId: r.sellerId, active: r.active })),
        triage?.id ?? null,
      )
    : null;
  const ex = analysis.extracted;

  // Persiste a análise (para timeline, painel do lead e auditoria de custo).
  await db.aiAnalysis.create({
    data: {
      organizationId: orgId,
      messageId: message.id,
      source: analysis.source,
      provider: analysis.usage.provider ?? undefined,
      model: analysis.usage.model ?? undefined,
      language: analysis.language,
      languageConfidence: analysis.languageConfidence,
      hasCommercialIntent: analysis.hasCommercialIntent,
      intentType: analysis.intentType,
      extracted: ex as Prisma.InputJsonValue,
      score: analysis.score,
      scoreFactors: analysis.scoreFactors as unknown as Prisma.InputJsonValue,
      summary: analysis.summary,
      suggestedReply: analysis.suggestedReply,
      confidence: analysis.confidence,
      inputTokens: analysis.usage.inputTokens,
      outputTokens: analysis.usage.outputTokens,
      costUsd: analysis.usage.costUsd,
    },
  });

  // ── 6. Cria ou atualiza o Lead ──────────────────────────────────────────
  let leadId: string | null = null;
  let leadCreated = false;

  if (analysis.hasCommercialIntent) {
    const funnel = await db.funnel.findFirst({
      where: { organizationId: orgId, isDefault: true },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    if (funnel) {
      const openLead = await db.lead.findFirst({
        where: { organizationId: orgId, contactId, wonAt: null, lostAt: null },
        orderBy: { createdAt: "desc" },
      });

      const material = ex.material
        ? await db.material.findFirst({
            where: {
              organizationId: orgId,
              commercialName: { equals: ex.material, mode: "insensitive" },
            },
          })
        : null;

      const stageForIntent = funnel.stages.find((s) => s.name === "Lead identificado") ?? funnel.stages[1] ?? funnel.stages[0];

      if (openLead) {
        // Atualiza o lead existente sem sobrescrever com vazio (item 40).
        await db.lead.update({
          where: { id: openLead.id },
          data: {
            language: analysis.language,
            score: Math.max(openLead.score, analysis.score),
            temperature: analysis.temperature,
            intentType: analysis.intentType,
            buyingIntent: openLead.buyingIntent || analysis.score >= 61,
            materialId: material?.id ?? openLead.materialId,
            materialText: ex.material ?? openLead.materialText,
            thicknessCm: ex.thicknessCm ?? openLead.thicknessCm,
            finish: ex.finish ?? openLead.finish,
            squareMeters: ex.squareMeters ?? openLead.squareMeters,
            quantitySlabs: ex.quantitySlabs ?? openLead.quantitySlabs,
            hasProject: openLead.hasProject || !!ex.hasProject,
            lastContactAt: now,
          },
        });
        leadId = openLead.id;
      } else {
        const created = await db.lead.create({
          data: {
            organizationId: orgId,
            contactId,
            sellerId: routing?.sellerId ?? undefined,
            ownerUserId: undefined,
            funnelId: funnel.id,
            stageId: stageForIntent.id,
            title: ex.material
              ? `${ex.material}${ex.squareMeters ? ` — ${ex.squareMeters} m²` : ""}`
              : `Novo lead — ${msg.channel}`,
            sourceType: SOURCE_TYPE[msg.channel],
            channel: msg.channel,
            language: analysis.language,
            score: analysis.score,
            temperature: analysis.temperature,
            intentType: analysis.intentType,
            buyingIntent: analysis.score >= 61,
            isTriage: routing?.isTriage ?? false,
            materialId: material?.id ?? undefined,
            materialText: ex.material ?? undefined,
            thicknessCm: ex.thicknessCm ?? undefined,
            finish: ex.finish ?? undefined,
            squareMeters: ex.squareMeters ?? undefined,
            quantitySlabs: ex.quantitySlabs ?? undefined,
            hasProject: !!ex.hasProject,
            lastContactAt: now,
            stageEvents: {
              create: {
                organizationId: orgId,
                toStageId: stageForIntent.id,
                actorType: "AI",
                note: `Lead criado por intenção comercial (${analysis.intentType}) · ${analysis.source}`,
              },
            },
            scoreFactors: {
              create: analysis.scoreFactors.map((f) => ({ factor: f.factor, weight: f.weight })),
            },
          },
        });
        leadId = created.id;
        leadCreated = true;

        await db.activity.create({
          data: {
            organizationId: orgId,
            actorType: "AI",
            verb: "created_lead",
            subjectType: "lead",
            subjectId: created.id,
            summary: `Lead criado — ${analysis.language}, ${routing?.isTriage ? "triagem" : "roteado"}, score ${analysis.score}${
              analysis.source !== "heuristic" ? " (IA)" : ""
            }`,
          },
        });
      }
    }
  } else {
    // Sem intenção comercial: registra o sinal, NÃO cria lead (item 2 e 3).
    await db.activity.create({
      data: {
        organizationId: orgId,
        actorType: "AI",
        verb: "no_intent",
        subjectType: "contact",
        subjectId: contactId,
        summary: `Mensagem sem intenção comercial em ${msg.channel} — nenhum lead criado`,
      },
    });
  }

  // ── 6b. Consulta de disponibilidade real (item 28) ─────────────────────
  if (
    leadId &&
    ex.material &&
    ["AVAILABILITY", "PRICE", "QUOTE", "SAMPLE"].includes(analysis.intentType)
  ) {
    const avail = await checkAvailability({
      organizationId: orgId,
      material: ex.material,
      thicknessCm: ex.thicknessCm,
    });
    await db.activity.create({
      data: {
        organizationId: orgId,
        actorType: "SYSTEM",
        verb: "availability_check",
        subjectType: "lead",
        subjectId: leadId,
        summary: `Estoque: ${avail.note}`,
      },
    });
  }

  // ── 7. Atualiza a conversa ──────────────────────────────────────────────
  const assignedSellerId = conversation.assignedSellerId ?? routing?.sellerId ?? null;

  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: now,
      lastMessagePreview: msg.text.slice(0, 140),
      unreadCount: { increment: 1 },
      status: "OPEN",
      assignedSellerId: assignedSellerId ?? undefined,
      assignedUserId: conversation.assignedUserId ?? undefined,
    },
  });

  return {
    contactId,
    conversationId: conversation.id,
    messageId: message.id,
    leadId,
    leadCreated,
    hadCommercialIntent: analysis.hasCommercialIntent,
    language: analysis.language,
    duplicateMessage: false,
  };
}
