"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { record } from "@/lib/audit";

const num = (v: unknown) => (v === "" || v == null ? undefined : v);

async function nextNumber(organizationId: string, prefix: string) {
  const year = new Date().getFullYear();
  const count =
    prefix === "COT"
      ? await prisma.quote.count({ where: { organizationId, createdAt: { gte: new Date(`${year}-01-01`) } } })
      : await prisma.order.count({ where: { organizationId, createdAt: { gte: new Date(`${year}-01-01`) } } });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function recalc(quoteId: string) {
  const items = await prisma.quoteItem.findMany({ where: { quoteId } });
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const total = subtotal + (quote?.freightAmount ?? 0);
  await prisma.quote.update({ where: { id: quoteId }, data: { subtotal, total } });
}

// ─── Criar cotação ───────────────────────────────────────────────────────────

const createSchema = z.object({
  leadId: z.string().optional(),
  projectId: z.string().optional(),
  customerId: z.string().optional(),
  currency: z.enum(["BRL", "USD", "EUR"]),
  incoterm: z.enum(["EXW", "FOB", "CFR", "CIF", "DAP", "DDP"]).optional(),
  portOfLoading: z.string().optional(),
  portOfDestination: z.string().optional(),
  paymentTerms: z.string().optional(),
  validUntil: z.string().optional(),
  freightAmount: z.coerce.number().optional(),
  notes: z.string().optional(),
});

export type QuoteState = { error?: string };

export async function createQuote(_prev: QuoteState, formData: FormData): Promise<QuoteState> {
  const user = await requireUser();
  if (!can(user.role, "create", "quote")) return { error: "Sem permissão." };
  const parsed = createSchema.safeParse({
    ...Object.fromEntries(formData),
    freightAmount: num(formData.get("freightAmount")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  let customerId = d.customerId || undefined;
  // Se veio de um lead sem cliente, cria o cliente na hora (conversão explícita).
  if (!customerId && d.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: d.leadId, organizationId: user.organizationId },
      include: { contact: true, company: true },
    });
    if (lead) {
      const existing = await prisma.customer.findFirst({
        where: { organizationId: user.organizationId, contactId: lead.contactId },
      });
      customerId =
        existing?.id ??
        (
          await prisma.customer.create({
            data: {
              organizationId: user.organizationId,
              contactId: lead.contactId,
              companyId: lead.companyId ?? undefined,
              name: lead.company?.name ?? lead.contact.displayName,
              market: lead.market ?? undefined,
            },
          })
        ).id;
    }
  }

  const number = await nextNumber(user.organizationId, "COT");
  const quote = await prisma.quote.create({
    data: {
      organizationId: user.organizationId,
      number,
      leadId: d.leadId || undefined,
      projectId: d.projectId || undefined,
      customerId,
      ownerUserId: user.id,
      currency: d.currency,
      incoterm: d.incoterm,
      portOfLoading: d.portOfLoading || undefined,
      portOfDestination: d.portOfDestination || undefined,
      paymentTerms: d.paymentTerms || undefined,
      validUntil: d.validUntil ? new Date(d.validUntil) : undefined,
      freightAmount: d.freightAmount,
      notes: d.notes || undefined,
      status: "DRAFT",
    },
  });

  await record(user, {
    action: "create",
    entity: "quote",
    entityId: quote.id,
    verb: "created_quote",
    subjectType: d.leadId ? "lead" : "quote",
    subjectId: d.leadId ?? quote.id,
    summary: `Cotação ${number} criada`,
  });

  revalidatePath("/cotacoes");
  redirect(`/cotacoes/${quote.id}`);
}

// ─── Itens ───────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  quoteId: z.string(),
  materialId: z.string().optional(),
  bundleId: z.string().optional(),
  description: z.string().min(1, "Descreva o item."),
  quantitySlabs: z.coerce.number().optional(),
  squareMeters: z.coerce.number().positive("Informe os m²."),
  thicknessCm: z.coerce.number().optional(),
  finish: z.enum(["POLISHED", "HONED", "LEATHER", "BRUSHED", "SANDBLASTED", "SAWN", "OTHER"]).optional(),
  unitPrice: z.coerce.number().min(0, "Informe o preço/m²."),
});

export async function addQuoteItem(_prev: QuoteState, formData: FormData): Promise<QuoteState> {
  const user = await requireUser();
  if (!can(user.role, "edit", "quote")) return { error: "Sem permissão." };
  const parsed = itemSchema.safeParse({
    ...Object.fromEntries(formData),
    quantitySlabs: num(formData.get("quantitySlabs")),
    thicknessCm: num(formData.get("thicknessCm")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const quote = await prisma.quote.findFirst({
    where: { id: d.quoteId, organizationId: user.organizationId },
    include: { items: true },
  });
  if (!quote) return { error: "Cotação não encontrada." };
  if (quote.status === "CONVERTED") return { error: "Cotação já convertida em pedido." };

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id,
      materialId: d.materialId || undefined,
      bundleId: d.bundleId || undefined,
      description: d.description,
      quantitySlabs: d.quantitySlabs,
      squareMeters: d.squareMeters,
      thicknessCm: d.thicknessCm,
      finish: d.finish,
      unitPrice: d.unitPrice,
      lineTotal: Math.round(d.squareMeters * d.unitPrice * 100) / 100,
      position: quote.items.length,
    },
  });
  await recalc(quote.id);
  revalidatePath(`/cotacoes/${quote.id}`);
  return {};
}

export async function deleteQuoteItem(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "edit", "quote")) throw new Error("Sem permissão.");
  const { itemId } = z.object({ itemId: z.string() }).parse(Object.fromEntries(formData));
  const item = await prisma.quoteItem.findFirst({
    where: { id: itemId, quote: { organizationId: user.organizationId } },
  });
  if (!item) throw new Error("Item não encontrado.");
  await prisma.quoteItem.delete({ where: { id: item.id } });
  await recalc(item.quoteId);
  revalidatePath(`/cotacoes/${item.quoteId}`);
}

// ─── Status ──────────────────────────────────────────────────────────────────

const statusSchema = z.object({
  quoteId: z.string(),
  status: z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED", "EXPIRED"]),
});

export async function setQuoteStatus(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "edit", "quote")) throw new Error("Sem permissão.");
  const { quoteId, status } = statusSchema.parse(Object.fromEntries(formData));
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, organizationId: user.organizationId } });
  if (!quote || quote.status === "CONVERTED") throw new Error("Não é possível alterar.");

  await prisma.quote.update({
    where: { id: quote.id },
    data: { status, sentAt: status === "SENT" ? new Date() : quote.sentAt },
  });
  await record(user, {
    action: "status",
    entity: "quote",
    entityId: quote.id,
    verb: "quote_status",
    subjectType: quote.leadId ? "lead" : "quote",
    subjectId: quote.leadId ?? quote.id,
    summary: `Cotação ${quote.number}: ${status}`,
  });
  revalidatePath(`/cotacoes/${quote.id}`);
  revalidatePath("/cotacoes");
}

export async function duplicateQuote(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "create", "quote")) throw new Error("Sem permissão.");
  const { quoteId } = z.object({ quoteId: z.string() }).parse(Object.fromEntries(formData));
  const src = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId: user.organizationId },
    include: { items: true },
  });
  if (!src) throw new Error("Cotação não encontrada.");

  const number = await nextNumber(user.organizationId, "COT");
  const copy = await prisma.quote.create({
    data: {
      organizationId: user.organizationId,
      number,
      leadId: src.leadId,
      projectId: src.projectId,
      customerId: src.customerId,
      ownerUserId: user.id,
      currency: src.currency,
      incoterm: src.incoterm,
      portOfLoading: src.portOfLoading,
      portOfDestination: src.portOfDestination,
      paymentTerms: src.paymentTerms,
      freightAmount: src.freightAmount,
      notes: src.notes,
      status: "DRAFT",
      subtotal: src.subtotal,
      total: src.total,
      items: {
        create: src.items.map((i) => ({
          materialId: i.materialId,
          bundleId: i.bundleId,
          description: i.description,
          quantitySlabs: i.quantitySlabs,
          squareMeters: i.squareMeters,
          thicknessCm: i.thicknessCm,
          finish: i.finish,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
          position: i.position,
        })),
      },
    },
  });
  revalidatePath("/cotacoes");
  redirect(`/cotacoes/${copy.id}`);
}

// ─── Converter em pedido ─────────────────────────────────────────────────────

export async function convertQuoteToOrder(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "create", "order")) throw new Error("Sem permissão.");
  const { quoteId } = z.object({ quoteId: z.string() }).parse(Object.fromEntries(formData));

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId: user.organizationId },
    include: { items: true, customer: true, lead: true, order: true },
  });
  if (!quote) throw new Error("Cotação não encontrada.");
  if (quote.order) throw new Error("Já existe um pedido para esta cotação.");
  if (quote.items.length === 0) throw new Error("Cotação sem itens.");

  const number = await nextNumber(user.organizationId, "PED");
  const market: "USA" | "DOMESTIC" =
    quote.currency !== "BRL" && quote.incoterm && quote.incoterm !== "DDP" ? "USA" : "DOMESTIC";

  const order = await prisma.order.create({
    data: {
      organizationId: user.organizationId,
      number,
      quoteId: quote.id,
      customerId: quote.customerId ?? undefined,
      ownerUserId: user.id,
      market,
      destination: quote.portOfDestination ?? undefined,
      currency: quote.currency,
      incoterm: quote.incoterm ?? undefined,
      total: quote.total,
      paymentTerms: quote.paymentTerms ?? undefined,
      status: "CONFIRMED",
      items: {
        create: quote.items.map((i) => ({
          description: i.description,
          materialId: i.materialId,
          bundleId: i.bundleId,
          quantitySlabs: i.quantitySlabs,
          squareMeters: i.squareMeters,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        })),
      },
    },
  });

  // Reserva os bundles cotados.
  const bundleIds = quote.items.map((i) => i.bundleId).filter((b): b is string => !!b);
  if (bundleIds.length) {
    await prisma.bundle.updateMany({
      where: { id: { in: bundleIds }, organizationId: user.organizationId },
      data: { status: "RESERVED" },
    });
  }

  await prisma.quote.update({ where: { id: quote.id }, data: { status: "CONVERTED" } });

  // Lead → cliente + move para "Pedido confirmado".
  if (quote.leadId) {
    const funnelStage = await prisma.funnelStage.findFirst({
      where: { funnel: { organizationId: user.organizationId, isDefault: true }, name: "Pedido confirmado" },
    });
    if (funnelStage) {
      await prisma.lead.update({ where: { id: quote.leadId }, data: { stageId: funnelStage.id } });
    }
  }

  await record(user, {
    action: "convert",
    entity: "order",
    entityId: order.id,
    verb: "converted_order",
    subjectType: quote.leadId ? "lead" : "order",
    subjectId: quote.leadId ?? order.id,
    summary: `Pedido ${number} criado a partir da cotação ${quote.number}`,
  });

  revalidatePath("/cotacoes");
  revalidatePath("/pedidos");
  redirect(`/pedidos/${order.id}`);
}
