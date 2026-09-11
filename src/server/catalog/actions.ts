"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { record } from "@/lib/audit";

const num = (v: unknown) => (v === "" || v == null ? undefined : v);

// ─── Materiais ───────────────────────────────────────────────────────────────

const materialSchema = z.object({
  commercialName: z.string().min(2, "Informe o nome comercial."),
  technicalName: z.string().optional(),
  type: z.enum(["GRANITE", "QUARTZITE", "MARBLE", "DOLOMITE", "SOAPSTONE", "QUARTZ", "OTHER"]),
  origin: z.string().optional(),
  quarry: z.string().optional(),
  code: z.string().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
});

export type CatalogState = { error?: string };

export async function createMaterial(_prev: CatalogState, formData: FormData): Promise<CatalogState> {
  const user = await requireUser();
  if (!can(user.role, "create", "product")) return { error: "Sem permissão." };
  const parsed = materialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const existing = await prisma.material.findFirst({
    where: { organizationId: user.organizationId, commercialName: { equals: d.commercialName, mode: "insensitive" } },
  });
  if (existing) return { error: "Já existe um material com esse nome." };

  const material = await prisma.material.create({
    data: {
      organizationId: user.organizationId,
      commercialName: d.commercialName,
      technicalName: d.technicalName || undefined,
      type: d.type,
      origin: d.origin || undefined,
      quarry: d.quarry || undefined,
      code: d.code || undefined,
      color: d.color || undefined,
      description: d.description || undefined,
    },
  });
  await record(user, { action: "create", entity: "material", entityId: material.id, verb: "created_material", summary: `Material ${material.commercialName}` });
  revalidatePath("/produtos");
  redirect(`/produtos/${material.id}`);
}

// ─── Blocos ──────────────────────────────────────────────────────────────────

const blockSchema = z.object({
  materialId: z.string().min(1),
  blockNumber: z.string().min(1, "Informe o número do bloco."),
  quarry: z.string().optional(),
  lengthCm: z.coerce.number().optional(),
  widthCm: z.coerce.number().optional(),
  heightCm: z.coerce.number().optional(),
  weightKg: z.coerce.number().optional(),
  quality: z.enum(["FIRST", "COMMERCIAL", "A", "B", "C"]).optional(),
});

export async function createBlock(_prev: CatalogState, formData: FormData): Promise<CatalogState> {
  const user = await requireUser();
  if (!can(user.role, "create", "product")) return { error: "Sem permissão." };
  const parsed = blockSchema.safeParse({
    ...Object.fromEntries(formData),
    lengthCm: num(formData.get("lengthCm")),
    widthCm: num(formData.get("widthCm")),
    heightCm: num(formData.get("heightCm")),
    weightKg: num(formData.get("weightKg")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const material = await prisma.material.findFirst({ where: { id: d.materialId, organizationId: user.organizationId } });
  if (!material) return { error: "Material inválido." };

  const volumeM3 =
    d.lengthCm && d.widthCm && d.heightCm ? (d.lengthCm * d.widthCm * d.heightCm) / 1_000_000 : undefined;

  const block = await prisma.block.create({
    data: {
      organizationId: user.organizationId,
      materialId: d.materialId,
      blockNumber: d.blockNumber,
      quarry: d.quarry || material.quarry || undefined,
      lengthCm: d.lengthCm,
      widthCm: d.widthCm,
      heightCm: d.heightCm,
      volumeM3,
      weightKg: d.weightKg,
      quality: d.quality,
    },
  });
  await record(user, { action: "create", entity: "block", entityId: block.id, verb: "created_block", summary: `Bloco ${block.blockNumber}` });
  revalidatePath("/estoque");
  redirect(`/produtos/${d.materialId}`);
}

// ─── Bundles ─────────────────────────────────────────────────────────────────

const bundleSchema = z.object({
  materialId: z.string().min(1),
  blockId: z.string().optional(),
  bundleNumber: z.string().min(1, "Informe o número do bundle."),
  slabCount: z.coerce.number().int().min(0).optional(),
  squareMeters: z.coerce.number().optional(),
  thicknessCm: z.coerce.number().optional(),
  finish: z.enum(["POLISHED", "HONED", "LEATHER", "BRUSHED", "SANDBLASTED", "SAWN", "OTHER"]).optional(),
  quality: z.enum(["FIRST", "COMMERCIAL", "A", "B", "C"]).optional(),
  location: z.string().optional(),
  status: z.enum(["AVAILABLE", "RESERVED", "SOLD", "IN_PRODUCTION", "IN_NEGOTIATION"]).optional(),
});

export async function createBundle(_prev: CatalogState, formData: FormData): Promise<CatalogState> {
  const user = await requireUser();
  if (!can(user.role, "create", "product")) return { error: "Sem permissão." };
  const parsed = bundleSchema.safeParse({
    ...Object.fromEntries(formData),
    slabCount: num(formData.get("slabCount")),
    squareMeters: num(formData.get("squareMeters")),
    thicknessCm: num(formData.get("thicknessCm")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const material = await prisma.material.findFirst({ where: { id: d.materialId, organizationId: user.organizationId } });
  if (!material) return { error: "Material inválido." };

  const bundle = await prisma.bundle.create({
    data: {
      organizationId: user.organizationId,
      materialId: d.materialId,
      blockId: d.blockId || undefined,
      bundleNumber: d.bundleNumber,
      slabCount: d.slabCount ?? 0,
      squareMeters: d.squareMeters,
      thicknessCm: d.thicknessCm,
      finish: d.finish,
      quality: d.quality,
      location: d.location || undefined,
      status: d.status ?? "AVAILABLE",
    },
  });
  await record(user, { action: "create", entity: "bundle", entityId: bundle.id, verb: "created_bundle", summary: `Bundle ${bundle.bundleNumber}` });
  revalidatePath("/estoque");
  redirect(`/produtos/${d.materialId}`);
}

const bundleStatusSchema = z.object({
  bundleId: z.string(),
  status: z.enum(["AVAILABLE", "RESERVED", "SOLD", "IN_PRODUCTION", "IN_NEGOTIATION"]),
});

export async function setBundleStatus(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "edit", "product")) throw new Error("Sem permissão.");
  const { bundleId, status } = bundleStatusSchema.parse(Object.fromEntries(formData));
  await prisma.bundle.updateMany({
    where: { id: bundleId, organizationId: user.organizationId },
    data: { status },
  });
  revalidatePath("/estoque");
}
