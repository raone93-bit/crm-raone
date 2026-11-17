import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";

/**
 * Dados da empresa que quase nunca mudam (etapas do funil, vendedores,
 * materiais). Lidos a cada clique antes; agora vêm do cache da Vercel e só
 * vão ao banco a cada 2 minutos — ou na hora, quando algo muda (revalidateTag).
 *
 * IMPORTANTE: só campos simples (texto, número, boolean, listas). O cache
 * serializa em JSON, então datas voltariam como texto.
 */

export const TAGS = {
  stages: (orgId: string) => `org:${orgId}:stages`,
  sellers: (orgId: string) => `org:${orgId}:sellers`,
  materials: (orgId: string) => `org:${orgId}:materials`,
};

export function getStages(orgId: string) {
  return unstable_cache(
    () =>
      prisma.funnelStage.findMany({
        where: { funnel: { organizationId: orgId, isDefault: true } },
        orderBy: { position: "asc" },
        select: { id: true, name: true, position: true, isWon: true, isLost: true, probability: true },
      }),
    ["stages", orgId],
    { revalidate: 120, tags: [TAGS.stages(orgId)] },
  )();
}

export function getSellers(orgId: string) {
  return unstable_cache(
    () =>
      prisma.seller.findMany({
        where: { organizationId: orgId },
        orderBy: { displayName: "asc" },
        select: {
          id: true,
          userId: true,
          displayName: true,
          languages: true,
          active: true,
          isTriageQueue: true,
          user: { select: { email: true } },
        },
      }),
    ["sellers", orgId],
    { revalidate: 120, tags: [TAGS.sellers(orgId)] },
  )();
}

export function getActiveMaterials(orgId: string) {
  return unstable_cache(
    () =>
      prisma.material.findMany({
        where: { organizationId: orgId, active: true },
        orderBy: { commercialName: "asc" },
        select: { id: true, commercialName: true },
      }),
    ["materials", orgId],
    { revalidate: 120, tags: [TAGS.materials(orgId)] },
  )();
}
