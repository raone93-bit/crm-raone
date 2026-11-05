import type { Finish, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { checkAvailability } from "@/server/catalog/availability";

/**
 * Ferramentas do agente SDR. Cada uma lê ou grava dado REAL do CRM — o agente
 * não tem outro jeito de "saber" estoque, catálogo ou de mexer no lead.
 */

export const SDR_TOOLS = [
  {
    name: "list_catalog",
    description: "Lista os materiais ativos do catálogo (nome comercial, tipo, cor, origem). Use antes de falar de materiais.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "check_availability",
    description:
      "Consulta o estoque real de um material (bundles disponíveis ou em produção, m² aproximados). Única fonte permitida para falar de disponibilidade.",
    input_schema: {
      type: "object",
      properties: {
        material: { type: "string", description: "Nome comercial do material, como no catálogo." },
        thickness_cm: { type: "number", description: "Espessura em cm (2, 3…). Opcional." },
        finish: { type: "string", enum: ["POLISHED", "HONED", "LEATHER", "BRUSHED", "SANDBLASTED", "SAWN"] },
      },
      required: ["material"],
      additionalProperties: false,
    },
  },
  {
    name: "update_lead",
    description:
      "Registra no CRM os dados que o cliente informou. Preencha só o que foi dito explicitamente — nunca deduza.",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string" },
        company_type: { type: "string", description: "importador, distribuidor, marmoraria, construtora, arquiteto…" },
        country: { type: "string" },
        city: { type: "string" },
        destination_port: { type: "string" },
        material: { type: "string" },
        thickness_cm: { type: "number" },
        finish: { type: "string", enum: ["POLISHED", "HONED", "LEATHER", "BRUSHED", "SANDBLASTED", "SAWN", "OTHER"] },
        square_meters: { type: "number" },
        quantity_slabs: { type: "integer" },
        containers: { type: "string", description: "Volume em containers, como o cliente disse (ex.: '2 por mês')." },
        has_project: { type: "boolean" },
        deadline: { type: "string", description: "Prazo do projeto, como o cliente disse." },
        email: { type: "string" },
        notes: { type: "string", description: "Outro dado relevante dito pelo cliente." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "schedule_call",
    description:
      "Cria a tarefa de ligação/reunião para um vendedor no horário que o cliente pediu. Você não liga; o vendedor liga.",
    input_schema: {
      type: "object",
      properties: {
        preferred_time: { type: "string", description: "Dia/horário pedido, com fuso se o cliente disse (ex.: 'terça 10h Miami')." },
        due_at_iso: { type: "string", description: "O mesmo horário em ISO 8601 com fuso, se der para converter sem chutar." },
        phone: { type: "string", description: "Telefone para ligar, se diferente do canal atual." },
        mode: { type: "string", enum: ["phone", "whatsapp_call", "video"] },
        reason: { type: "string" },
      },
      required: ["preferred_time"],
      additionalProperties: false,
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Passa a conversa para um vendedor: pausa o piloto automático nesta conversa e cria tarefa com o resumo. Use para preço/cotação, lead qualificado, pedido de humano ou assunto fora de pré-vendas.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", enum: ["price_or_quote", "qualified", "asked_for_human", "complaint", "out_of_scope", "other"] },
        summary: { type: "string", description: "Resumo em português para o vendedor: quem é, o que quer, dados já coletados." },
        urgent: { type: "boolean" },
      },
      required: ["reason", "summary"],
      additionalProperties: false,
    },
  },
  {
    name: "send_reply",
    description: "Envia a mensagem final ao cliente. Encerra a sua vez.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "no_reply",
    description: "Encerra a sua vez sem mandar mensagem (nada a responder).",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
] as const;

export type ToolContext = {
  organizationId: string;
  conversationId: string;
  contactId: string;
  contactName: string;
  leadId: string | null;
  handoffUserId: string | null;
  /** Preenchido pelas ferramentas para o guardrail final. */
  state: { availabilityChecked: boolean; handedOff: boolean; actions: string[] };
};

const FINISHES = new Set(["POLISHED", "HONED", "LEATHER", "BRUSHED", "SANDBLASTED", "SAWN", "OTHER"]);

export async function runTool(name: string, input: any, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case "list_catalog": {
      const materials = await prisma.material.findMany({
        where: { organizationId: ctx.organizationId, active: true },
        select: { commercialName: true, type: true, color: true, origin: true, category: true },
        orderBy: { commercialName: "asc" },
        take: 100,
      });
      return { materials };
    }

    case "check_availability": {
      ctx.state.availabilityChecked = true;
      ctx.state.actions.push(`estoque: ${input.material}`);
      const r = await checkAvailability({
        organizationId: ctx.organizationId,
        material: input.material,
        thicknessCm: typeof input.thickness_cm === "number" ? input.thickness_cm : undefined,
        finish: input.finish,
      });
      // Não expõe localização nem número de bundle ao cliente — só o agregado.
      return {
        found: r.found,
        material: r.material,
        approxSquareMeters: r.totalSquareMeters,
        bundleCount: r.bundles.length,
        thicknesses: [...new Set(r.bundles.map((b) => b.thicknessCm).filter(Boolean))],
        finishes: [...new Set(r.bundles.map((b) => b.finish).filter(Boolean))],
        note: r.note,
      };
    }

    case "update_lead": {
      ctx.state.actions.push("atualizou lead");
      const contactData: Prisma.ContactUpdateInput = {};
      if (input.country) contactData.country = String(input.country);
      if (input.city) contactData.city = String(input.city);
      if (input.email && /.+@.+\..+/.test(input.email)) contactData.email = String(input.email);
      if (Object.keys(contactData).length) {
        await prisma.contact.update({ where: { id: ctx.contactId }, data: contactData });
      }

      if (ctx.leadId) {
        const leadData: Prisma.LeadUpdateInput = { lastContactAt: new Date() };
        if (input.material) leadData.materialText = String(input.material);
        if (typeof input.thickness_cm === "number") leadData.thicknessCm = input.thickness_cm;
        if (input.finish && FINISHES.has(input.finish)) leadData.finish = input.finish as Finish;
        if (typeof input.square_meters === "number") leadData.squareMeters = input.square_meters;
        if (Number.isInteger(input.quantity_slabs)) leadData.quantitySlabs = input.quantity_slabs;
        if (input.has_project === true) leadData.hasProject = true;
        if (input.material) {
          const mat = await prisma.material.findFirst({
            where: { organizationId: ctx.organizationId, commercialName: { equals: input.material, mode: "insensitive" } },
          });
          if (mat) leadData.material = { connect: { id: mat.id } };
        }
        await prisma.lead.update({ where: { id: ctx.leadId }, data: leadData });
      }

      // O que não tem coluna própria vai como nota (empresa, porto, volume…).
      const extras = [
        input.company && `Empresa: ${input.company}`,
        input.company_type && `Tipo: ${input.company_type}`,
        input.destination_port && `Porto de destino: ${input.destination_port}`,
        input.containers && `Volume: ${input.containers}`,
        input.deadline && `Prazo do projeto: ${input.deadline}`,
        input.notes && String(input.notes),
      ].filter(Boolean);
      if (extras.length) {
        await prisma.note.create({
          data: {
            organizationId: ctx.organizationId,
            subjectType: ctx.leadId ? "lead" : "contact",
            subjectId: ctx.leadId ?? ctx.contactId,
            body: `[Agente SDR] ${extras.join(" · ")}`,
          },
        });
      }
      return { saved: true, leadExists: !!ctx.leadId };
    }

    case "schedule_call": {
      ctx.state.actions.push(`agendou ligação: ${input.preferred_time}`);
      const due = input.due_at_iso ? new Date(input.due_at_iso) : null;
      const task = await prisma.task.create({
        data: {
          organizationId: ctx.organizationId,
          leadId: ctx.leadId ?? undefined,
          contactId: ctx.contactId,
          assigneeUserId: await assigneeFor(ctx),
          type: "CALL",
          title: `Ligar para ${ctx.contactName} — ${input.preferred_time}`,
          note: [
            input.mode && `Meio: ${input.mode}`,
            input.phone && `Telefone: ${input.phone}`,
            input.reason && `Motivo: ${input.reason}`,
            "Agendado pelo Agente SDR. Confirme o horário com o cliente se precisar.",
          ]
            .filter(Boolean)
            .join("\n"),
          dueAt: due && !Number.isNaN(due.getTime()) ? due : undefined,
        },
      });
      await activity(ctx, "scheduled_call", `Agente SDR agendou ligação: ${input.preferred_time}`);
      return { scheduled: true, taskId: task.id };
    }

    case "handoff_to_human": {
      ctx.state.handedOff = true;
      ctx.state.actions.push(`passou para humano (${input.reason})`);
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { aiPaused: true, aiPausedReason: `Passado ao vendedor: ${input.reason}`, status: "OPEN" },
      });
      if (ctx.leadId && (input.reason === "qualified" || input.reason === "price_or_quote")) {
        await prisma.lead.update({
          where: { id: ctx.leadId },
          data: { temperature: input.reason === "qualified" ? "HOT" : "QUALIFIED", buyingIntent: true },
        });
      }
      await prisma.task.create({
        data: {
          organizationId: ctx.organizationId,
          leadId: ctx.leadId ?? undefined,
          contactId: ctx.contactId,
          assigneeUserId: await assigneeFor(ctx),
          type: input.reason === "price_or_quote" ? "SEND_QUOTE" : "FOLLOW_UP",
          title: `${input.urgent ? "URGENTE · " : ""}Assumir conversa com ${ctx.contactName}`,
          note: `[Agente SDR] ${input.summary}`,
          dueAt: new Date(Date.now() + (input.urgent ? 30 : 120) * 60_000),
        },
      });
      await activity(ctx, "ai_handoff", `Agente SDR passou a conversa para um vendedor (${input.reason})`);
      return { handedOff: true, note: "Piloto automático pausado nesta conversa. Mande uma última mensagem curta avisando o cliente." };
    }

    default:
      return { error: `ferramenta desconhecida: ${name}` };
  }
}

async function assigneeFor(ctx: ToolContext): Promise<string | undefined> {
  if (ctx.handoffUserId) return ctx.handoffUserId;
  if (ctx.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: ctx.leadId }, include: { seller: true } });
    return lead?.ownerUserId ?? lead?.seller?.userId ?? undefined;
  }
  return undefined;
}

async function activity(ctx: ToolContext, verb: string, summary: string) {
  await prisma.activity.create({
    data: {
      organizationId: ctx.organizationId,
      actorType: "AI",
      verb,
      subjectType: ctx.leadId ? "lead" : "contact",
      subjectId: ctx.leadId ?? ctx.contactId,
      summary,
    },
  });
}
