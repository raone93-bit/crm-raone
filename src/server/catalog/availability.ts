import { prisma } from "@/lib/prisma";

/**
 * Consulta de disponibilidade real (item 28).
 * A IA pode chamar isto para responder "Do you have Taj Mahal 3 cm?" — mas
 * SÓ com dados do estoque; nunca inventa (item 40).
 */
export type AvailabilityQuery = {
  organizationId: string;
  material?: string;
  thicknessCm?: number;
  finish?: string;
};

export type AvailabilityResult = {
  found: boolean;
  material: string | null;
  bundles: {
    bundleNumber: string;
    thicknessCm: number | null;
    finish: string | null;
    squareMeters: number | null;
    slabCount: number;
    location: string | null;
    status: string;
  }[];
  totalSquareMeters: number;
  note: string;
};

export async function checkAvailability(q: AvailabilityQuery): Promise<AvailabilityResult> {
  if (!q.material) {
    return { found: false, material: null, bundles: [], totalSquareMeters: 0, note: "Material não informado." };
  }

  const material = await prisma.material.findFirst({
    where: { organizationId: q.organizationId, commercialName: { equals: q.material, mode: "insensitive" } },
  });
  if (!material) {
    return {
      found: false,
      material: q.material,
      bundles: [],
      totalSquareMeters: 0,
      note: `"${q.material}" não está no catálogo. Verifique com o time.`,
    };
  }

  const bundles = await prisma.bundle.findMany({
    where: {
      organizationId: q.organizationId,
      materialId: material.id,
      status: { in: ["AVAILABLE", "IN_PRODUCTION"] },
      ...(q.thicknessCm ? { thicknessCm: q.thicknessCm } : {}),
      ...(q.finish ? { finish: q.finish as never } : {}),
    },
    orderBy: { bundleNumber: "asc" },
    take: 50,
  });

  const total = bundles.reduce((s, b) => s + (b.squareMeters ?? 0), 0);

  return {
    found: bundles.length > 0,
    material: material.commercialName,
    bundles: bundles.map((b) => ({
      bundleNumber: b.bundleNumber,
      thicknessCm: b.thicknessCm,
      finish: b.finish,
      squareMeters: b.squareMeters,
      slabCount: b.slabCount,
      location: b.location,
      status: b.status,
    })),
    totalSquareMeters: Math.round(total * 100) / 100,
    note:
      bundles.length > 0
        ? `${bundles.length} bundle(s), ~${Math.round(total)} m² disponíveis.`
        : `Sem estoque disponível de ${material.commercialName}${q.thicknessCm ? ` ${q.thicknessCm} cm` : ""} no momento.`,
  };
}

/** Visão de estoque agregada por material + espessura + acabamento. */
export async function getInventory(organizationId: string) {
  const bundles = await prisma.bundle.findMany({
    where: { organizationId },
    include: { material: true },
    orderBy: [{ material: { commercialName: "asc" } }, { thicknessCm: "asc" }],
  });

  const groups = new Map<
    string,
    {
      material: string;
      materialId: string;
      thicknessCm: number | null;
      finish: string | null;
      available: number;
      reserved: number;
      other: number;
      sqm: number;
      bundleCount: number;
    }
  >();

  for (const b of bundles) {
    const key = `${b.materialId}|${b.thicknessCm ?? "-"}|${b.finish ?? "-"}`;
    const g =
      groups.get(key) ??
      {
        material: b.material.commercialName,
        materialId: b.materialId,
        thicknessCm: b.thicknessCm,
        finish: b.finish,
        available: 0,
        reserved: 0,
        other: 0,
        sqm: 0,
        bundleCount: 0,
      };
    g.bundleCount += 1;
    g.sqm += b.squareMeters ?? 0;
    if (b.status === "AVAILABLE") g.available += 1;
    else if (b.status === "RESERVED" || b.status === "IN_NEGOTIATION") g.reserved += 1;
    else g.other += 1;
    groups.set(key, g);
  }

  return [...groups.values()].map((g) => ({ ...g, sqm: Math.round(g.sqm * 100) / 100 }));
}
