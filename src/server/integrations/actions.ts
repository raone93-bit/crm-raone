"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { IntegrationType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { record } from "@/lib/audit";
import { encryptToken, decryptToken } from "@/server/crypto/tokens";
import { graphGet, GraphError } from "@/server/channels/graph";

export type IntegrationState = { error?: string; ok?: string };

const saveSchema = z.object({
  type: z.enum(["WHATSAPP", "INSTAGRAM", "FACEBOOK"]),
  wabaId: z.string().optional(),
  phoneNumberId: z.string().optional(),
  pageId: z.string().optional(),
  igAccountId: z.string().optional(),
  accessToken: z.string().optional(),
});

async function testConnection(
  type: IntegrationType,
  ids: { phoneNumberId?: string; pageId?: string; igAccountId?: string },
  token: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    if (type === "WHATSAPP") {
      if (!ids.phoneNumberId) return { ok: false, detail: "Informe o Phone Number ID." };
      const r = await graphGet(`${ids.phoneNumberId}?fields=display_phone_number,verified_name`, token);
      return { ok: true, detail: `${r?.verified_name ?? "?"} (${r?.display_phone_number ?? "?"})` };
    }
    if (type === "FACEBOOK") {
      if (!ids.pageId) return { ok: false, detail: "Informe o Page ID." };
      const r = await graphGet(`${ids.pageId}?fields=name`, token);
      return { ok: true, detail: `Página: ${r?.name ?? "?"}` };
    }
    // INSTAGRAM — a conta pode ter sido conectada de dois jeitos diferentes
    // (item 11: a Meta muda isso com frequência, então tentamos os dois):
    //   1) Instagram Login direto (token "IGAA...") → graph.instagram.com/me
    //   2) Facebook Login / Página (token "EAA...") → graph.facebook.com/{igAccountId}
    try {
      const r = await graphGet("me?fields=id,username", token, "instagram");
      return { ok: true, detail: `@${r?.username ?? "?"} (Instagram Login, id ${r?.id})` };
    } catch {
      const target = ids.igAccountId ?? "me";
      const r = await graphGet(`${target}?fields=username,name`, token, "facebook");
      return { ok: true, detail: `@${r?.username ?? "?"} (via Página do Facebook)` };
    }
  } catch (err) {
    if (err instanceof GraphError) return { ok: false, detail: err.message };
    return { ok: false, detail: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function saveIntegration(
  _prev: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const user = await requireRole("ADMIN");
  const parsed = saveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Dados inválidos." };
  const d = parsed.data;

  const existing = await prisma.integration.findUnique({
    where: { organizationId_type: { organizationId: user.organizationId, type: d.type } },
  });

  // Token: só grava se veio um novo; senão mantém o atual.
  let encryptedToken = existing?.encryptedToken ?? null;
  if (d.accessToken && d.accessToken.trim() && !d.accessToken.startsWith("••••")) {
    try {
      encryptedToken = encryptToken(d.accessToken.trim());
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Falha ao cifrar o token." };
    }
  }

  const ids = {
    phoneNumberId: d.phoneNumberId || undefined,
    pageId: d.pageId || undefined,
    igAccountId: d.igAccountId || undefined,
  };

  let status: "NOT_CONFIGURED" | "CONNECTED" | "ERROR" = "NOT_CONFIGURED";
  let lastError: string | null = null;
  let lastSyncAt: Date | null = null;

  if (encryptedToken) {
    const test = await testConnection(d.type, ids, decryptToken(encryptedToken));
    if (test.ok) {
      status = "CONNECTED";
      lastSyncAt = new Date();
    } else {
      status = "ERROR";
      lastError = test.detail;
    }
  }

  await prisma.integration.upsert({
    where: { organizationId_type: { organizationId: user.organizationId, type: d.type } },
    update: {
      wabaId: d.wabaId || null,
      phoneNumberId: d.phoneNumberId || null,
      pageId: d.pageId || null,
      igAccountId: d.igAccountId || null,
      encryptedToken,
      status,
      lastError,
      lastSyncAt,
      webhookVerified: existing?.webhookVerified ?? false,
    },
    create: {
      organizationId: user.organizationId,
      type: d.type,
      wabaId: d.wabaId || null,
      phoneNumberId: d.phoneNumberId || null,
      pageId: d.pageId || null,
      igAccountId: d.igAccountId || null,
      encryptedToken,
      status,
      lastError,
      lastSyncAt,
    },
  });

  await record(user, {
    action: "configure",
    entity: "integration",
    entityId: d.type,
    verb: "configured_integration",
    summary: `Integração ${d.type}: ${status}`,
  });

  revalidatePath("/integracoes");
  revalidatePath("/integracoes/diagnostico");
  return status === "CONNECTED"
    ? { ok: `Conectado.` }
    : status === "ERROR"
      ? { error: `Não conectou: ${lastError}` }
      : { ok: "Salvo (sem token — ainda não conectado)." };
}

export async function testIntegration(formData: FormData) {
  const user = await requireRole("ADMIN");
  const type = z.enum(["WHATSAPP", "INSTAGRAM", "FACEBOOK"]).parse(formData.get("type"));

  const integration = await prisma.integration.findUnique({
    where: { organizationId_type: { organizationId: user.organizationId, type } },
  });
  if (!integration?.encryptedToken) {
    revalidatePath("/integracoes");
    return;
  }

  const test = await testConnection(
    type,
    {
      phoneNumberId: integration.phoneNumberId ?? undefined,
      pageId: integration.pageId ?? undefined,
      igAccountId: integration.igAccountId ?? undefined,
    },
    decryptToken(integration.encryptedToken),
  );

  await prisma.integration.update({
    where: { id: integration.id },
    data: test.ok
      ? { status: "CONNECTED", lastSyncAt: new Date(), lastError: null }
      : { status: "ERROR", lastError: test.detail },
  });

  revalidatePath("/integracoes");
  revalidatePath("/integracoes/diagnostico");
}

export async function disconnectIntegration(formData: FormData) {
  const user = await requireRole("ADMIN");
  const type = z.enum(["WHATSAPP", "INSTAGRAM", "FACEBOOK"]).parse(formData.get("type"));

  await prisma.integration.updateMany({
    where: { organizationId: user.organizationId, type },
    data: { status: "DISCONNECTED", encryptedToken: null },
  });

  await record(user, {
    action: "disconnect",
    entity: "integration",
    entityId: type,
    verb: "disconnected_integration",
    summary: `Integração ${type} desconectada`,
  });

  revalidatePath("/integracoes");
  revalidatePath("/integracoes/diagnostico");
}
