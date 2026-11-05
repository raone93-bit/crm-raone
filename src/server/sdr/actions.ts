"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { record } from "@/lib/audit";
import { AUTOPILOT_CHANNELS } from "./guards";

export type SdrSettingsState = { error?: string; ok?: string };

const schema = z.object({
  agentName: z.string().trim().min(2, "Dê um nome ao agente.").max(60),
  companyName: z.string().trim().min(2).max(80),
  knowledgeBase: z.string().max(20_000, "Base de conhecimento muito longa (máx. 20 mil caracteres)."),
  qualificationCriteria: z.string().max(4_000),
  handoffUserId: z.string().optional(),
  maxRepliesPerDay: z.coerce.number().int().min(1).max(100),
  model: z.string().trim().max(80).optional(),
});

/** Salva a configuração do agente SDR. Só admin. */
export async function saveSdrSettings(_prev: SdrSettingsState, formData: FormData): Promise<SdrSettingsState> {
  const user = await requireRole("ADMIN");
  const raw = Object.fromEntries(formData);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const enabled = formData.get("enabled") === "on";
  const channels = AUTOPILOT_CHANNELS.filter((c) => formData.get(`channel_${c}`) === "on");
  if (enabled && channels.length === 0) return { error: "Marque pelo menos um canal para ligar o agente." };

  let handoffUserId: string | null = parsed.data.handoffUserId || null;
  if (handoffUserId) {
    const u = await prisma.user.findFirst({ where: { id: handoffUserId, organizationId: user.organizationId, active: true } });
    if (!u) handoffUserId = null;
  }

  const data = {
    enabled,
    channels,
    agentName: parsed.data.agentName,
    companyName: parsed.data.companyName,
    knowledgeBase: parsed.data.knowledgeBase,
    qualificationCriteria: parsed.data.qualificationCriteria,
    handoffUserId,
    maxRepliesPerDay: parsed.data.maxRepliesPerDay,
    model: parsed.data.model || null,
  };

  const before = await prisma.sdrSettings.findUnique({ where: { organizationId: user.organizationId } });
  const saved = await prisma.sdrSettings.upsert({
    where: { organizationId: user.organizationId },
    create: { organizationId: user.organizationId, ...data },
    update: data,
  });

  await record(user, {
    action: "sdr_settings",
    entity: "sdr_settings",
    entityId: saved.id,
    before: before ? { enabled: before.enabled, channels: before.channels } : undefined,
    after: { enabled, channels },
    summary: `Agente SDR ${enabled ? "ligado" : "desligado"} (${channels.join(", ") || "sem canais"})`,
  });

  revalidatePath("/agente-sdr");
  return { ok: enabled ? "Salvo. O agente já responde nos canais marcados." : "Salvo. O agente está desligado." };
}
