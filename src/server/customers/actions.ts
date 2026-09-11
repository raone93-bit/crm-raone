"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { leadVisibilityWhere } from "@/lib/tenant";
import { record } from "@/lib/audit";

/**
 * Conversão explícita Lead → Cliente (item 4). Nunca automática.
 */
const schema = z.object({ leadId: z.string() });

export async function convertLeadToCustomer(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "create", "customer")) throw new Error("Sem permissão.");

  const { leadId } = schema.parse(Object.fromEntries(formData));
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...leadVisibilityWhere(user) },
    include: { contact: true, company: true },
  });
  if (!lead) throw new Error("Lead não encontrado.");

  const existing = await prisma.customer.findFirst({
    where: { organizationId: user.organizationId, contactId: lead.contactId },
  });
  if (existing) {
    revalidatePath(`/leads/${leadId}`);
    return;
  }

  const customer = await prisma.customer.create({
    data: {
      organizationId: user.organizationId,
      contactId: lead.contactId,
      companyId: lead.companyId ?? undefined,
      name: lead.company?.name ?? lead.contact.displayName,
      market: lead.market ?? undefined,
    },
  });

  await record(user, {
    action: "convert",
    entity: "customer",
    entityId: customer.id,
    verb: "converted_customer",
    subjectType: "lead",
    subjectId: lead.id,
    summary: `Lead convertido em cliente: ${customer.name}`,
  });

  revalidatePath("/clientes");
  revalidatePath(`/leads/${leadId}`);
}
