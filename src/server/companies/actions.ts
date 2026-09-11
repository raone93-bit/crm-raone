"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { record } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(2, "Informe o nome da empresa."),
  type: z
    .enum(["IMPORTER", "DISTRIBUTOR", "FABRICATOR", "ARCHITECT", "DESIGNER", "BUILDER", "RETAILER", "OTHER"])
    .optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  website: z.string().optional(),
  taxId: z.string().optional(),
});

export type CreateCompanyState = { error?: string };

export async function createCompany(
  _prev: CreateCompanyState,
  formData: FormData,
): Promise<CreateCompanyState> {
  const user = await requireUser();
  if (!can(user.role, "create", "company")) return { error: "Sem permissão." };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const company = await prisma.company.create({
    data: {
      organizationId: user.organizationId,
      name: d.name,
      type: d.type,
      country: d.country || undefined,
      city: d.city || undefined,
      website: d.website || undefined,
      taxId: d.taxId || undefined,
    },
  });

  await record(user, {
    action: "create",
    entity: "company",
    entityId: company.id,
    verb: "created_company",
    summary: `Empresa ${company.name} criada`,
  });

  revalidatePath("/empresas");
  redirect(`/empresas`);
}
