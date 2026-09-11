"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { record } from "@/lib/audit";
import { findDuplicate, type Candidate } from "@/server/leads/dedupe";

const schema = z.object({
  displayName: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  phone: z.string().optional(),
  channel: z.enum(["WHATSAPP", "INSTAGRAM", "FACEBOOK", "EMAIL", "PHONE", "MANUAL", "WEBSITE"]),
  externalId: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  primaryLanguage: z.enum(["PT", "ES", "EN", "OTHER"]).optional(),
});

export type CreateContactState = { error?: string; warning?: string };

export async function createContact(
  _prev: CreateContactState,
  formData: FormData,
): Promise<CreateContactState> {
  const user = await requireUser();
  if (!can(user.role, "create", "contact")) return { error: "Sem permissão." };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  // De-duplicação (item 5): antes de criar, procura contato provável.
  const existing = await prisma.contact.findMany({
    where: { organizationId: user.organizationId },
    include: { identities: true },
    take: 500,
  });
  const candidates: Candidate[] = existing.map((c) => ({
    contactId: c.id,
    displayName: c.displayName,
    phone: c.phone,
    email: c.email,
    country: c.country,
    lastActivityAt: c.updatedAt,
    identities: c.identities.map((i) => ({ channel: i.channel, externalId: i.externalId, handle: i.handle })),
  }));

  const externalId = d.externalId || `manual_${Date.now()}`;
  const match = findDuplicate(
    {
      channel: d.channel,
      externalId,
      name: d.displayName,
      phone: d.phone || null,
      email: d.email || null,
      country: d.country || null,
    },
    candidates,
  );

  if (match.action === "attach" && match.contactId) {
    // Anexa a identidade ao contato existente em vez de duplicar.
    await prisma.contactIdentity.upsert({
      where: {
        organizationId_channel_externalId: {
          organizationId: user.organizationId,
          channel: d.channel,
          externalId,
        },
      },
      update: {},
      create: {
        organizationId: user.organizationId,
        contactId: match.contactId,
        channel: d.channel,
        externalId,
        displayName: d.displayName,
      },
    });
    await record(user, {
      action: "merge_identity",
      entity: "contact",
      entityId: match.contactId,
      verb: "linked_channel",
      summary: `Canal ${d.channel} vinculado (${match.reason})`,
    });
    revalidatePath("/clientes");
    redirect(`/clientes/${match.contactId}`);
  }

  const contact = await prisma.contact.create({
    data: {
      organizationId: user.organizationId,
      displayName: d.displayName,
      email: d.email || undefined,
      phone: d.phone || undefined,
      country: d.country || undefined,
      city: d.city || undefined,
      primaryLanguage: d.primaryLanguage,
      possibleDuplicateOfId: match.action === "flag" ? match.contactId : undefined,
      duplicateConfidence: match.action === "flag" ? match.confidence : undefined,
      identities: {
        create: {
          organizationId: user.organizationId,
          channel: d.channel,
          externalId,
          displayName: d.displayName,
        },
      },
    },
  });

  await record(user, {
    action: "create",
    entity: "contact",
    entityId: contact.id,
    verb: "created_contact",
    summary: `Contato ${contact.displayName} criado`,
  });

  revalidatePath("/clientes");
  redirect(`/clientes/${contact.id}`);
}
