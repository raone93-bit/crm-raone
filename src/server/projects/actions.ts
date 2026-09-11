"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { record } from "@/lib/audit";

const num = (v: unknown) => (v === "" || v == null ? undefined : v);

const schema = z.object({
  name: z.string().min(2, "Informe o nome do projeto."),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  architect: z.string().optional(),
  fabricator: z.string().optional(),
  materialId: z.string().optional(),
  squareMeters: z.coerce.number().optional(),
  deadline: z.string().optional(),
  budget: z.coerce.number().optional(),
  budgetCurrency: z.enum(["BRL", "USD", "EUR"]).optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
});

export type ProjectState = { error?: string };

export async function createProject(_prev: ProjectState, formData: FormData): Promise<ProjectState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData),
    squareMeters: num(formData.get("squareMeters")),
    budget: num(formData.get("budget")),
    probability: num(formData.get("probability")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const project = await prisma.project.create({
    data: {
      organizationId: user.organizationId,
      ownerUserId: user.id,
      name: d.name,
      companyId: d.companyId || undefined,
      contactId: d.contactId || undefined,
      country: d.country || undefined,
      city: d.city || undefined,
      architect: d.architect || undefined,
      fabricator: d.fabricator || undefined,
      materialId: d.materialId || undefined,
      squareMeters: d.squareMeters,
      deadline: d.deadline ? new Date(d.deadline) : undefined,
      budget: d.budget,
      budgetCurrency: d.budgetCurrency,
      probability: d.probability ?? 0,
    },
  });

  await record(user, {
    action: "create",
    entity: "project",
    entityId: project.id,
    verb: "created_project",
    summary: `Projeto ${project.name}`,
  });

  revalidatePath("/projetos");
  redirect(`/projetos/${project.id}`);
}

export async function setProjectStatus(formData: FormData) {
  const user = await requireUser();
  const parsed = z
    .object({ projectId: z.string(), status: z.string().min(1) })
    .parse(Object.fromEntries(formData));
  await prisma.project.updateMany({
    where: { id: parsed.projectId, organizationId: user.organizationId },
    data: { status: parsed.status },
  });
  revalidatePath("/projetos");
  revalidatePath(`/projetos/${parsed.projectId}`);
}
