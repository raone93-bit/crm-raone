import Link from "next/link";
import { headers } from "next/headers";

import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { maskToken } from "@/server/crypto/tokens";
import { PageHeader, Badge } from "@/components/ui";
import { CopyField } from "./copy-field";
import { IntegrationForm } from "./integration-form";

export const metadata = { title: "Integrações" };

type ChannelType = "WHATSAPP" | "INSTAGRAM" | "FACEBOOK";

const CHANNELS: {
  type: ChannelType;
  name: string;
  api: string;
  path: string;
  prereqs: string[];
}[] = [
  {
    type: "WHATSAPP",
    name: "WhatsApp Business",
    api: "WhatsApp Cloud API",
    path: "whatsapp",
    prereqs: [
      "App da Meta (tipo Business) + Business verificado",
      "WhatsApp Business Account (WABA) e número dedicado",
      "Aprovação do display name; verificação do negócio para produção",
      "Token de System User permanente",
    ],
  },
  {
    type: "INSTAGRAM",
    name: "Instagram Direct",
    api: "Instagram Messaging API",
    path: "instagram",
    prereqs: [
      "Conta profissional do Instagram vinculada a uma Página do Facebook",
      "App Review das permissões de mensagens do Instagram",
      "Assinar o webhook do objeto Instagram (messages, comments)",
    ],
  },
  {
    type: "FACEBOOK",
    name: "Facebook Messenger",
    api: "Messenger Platform",
    path: "facebook",
    prereqs: [
      "Página do Facebook + App da Meta",
      "App Review das permissões de mensagens e metadados da Página",
      "Assinar o webhook do objeto Page (messages, messaging_postbacks, feed)",
    ],
  },
];

const STATUS_BADGE: Record<string, { label: string; tone: "accent" | "iron" | "gold" | "default" }> = {
  CONNECTED: { label: "conectado", tone: "accent" },
  ERROR: { label: "erro", tone: "iron" },
  DISCONNECTED: { label: "desconectado", tone: "gold" },
  NOT_CONFIGURED: { label: "config pendente", tone: "gold" },
};

export default async function IntegracoesPage() {
  const user = await requireRole("ADMIN");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "seu-dominio.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;

  const integrations = await prisma.integration.findMany({
    where: { organizationId: user.organizationId },
  });
  const byType = new Map(integrations.map((i) => [i.type, i]));

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN
    ? "(definido no ambiente)"
    : "(defina META_WEBHOOK_VERIFY_TOKEN)";
  const appSecret = process.env.META_APP_SECRET ? "definido" : "não definido";

  return (
    <div>
      <PageHeader
        title="Integrações"
        description="Canais da Meta. Tokens ficam só no backend, cifrados — nunca aparecem aqui."
        action={
          <Link href="/integracoes/diagnostico" className="btn-ghost">
            Diagnóstico →
          </Link>
        }
      />

      <div className="mb-5 rounded-lg border border-line bg-surface p-4 text-sm">
        <p className="label mb-2">Configuração do app da Meta (uma vez)</p>
        <ul className="space-y-1 text-ink-soft">
          <li>
            App Secret:{" "}
            <span className={process.env.META_APP_SECRET ? "text-accent" : "text-iron"}>{appSecret}</span> — variável{" "}
            <code>META_APP_SECRET</code>
          </li>
          <li>
            Verify token do webhook: {verifyToken} — variável <code>META_WEBHOOK_VERIFY_TOKEN</code>
          </li>
          <li>
            Chave de cifragem de tokens:{" "}
            <span className={process.env.CHANNEL_TOKEN_ENCRYPTION_KEY ? "text-accent" : "text-iron"}>
              {process.env.CHANNEL_TOKEN_ENCRYPTION_KEY ? "definida" : "não definida"}
            </span>{" "}
            — <code>CHANNEL_TOKEN_ENCRYPTION_KEY</code>
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-4">
        {CHANNELS.map((c) => {
          const integ = byType.get(c.type);
          const status = integ?.status ?? "NOT_CONFIGURED";
          const badge = STATUS_BADGE[status] ?? STATUS_BADGE.NOT_CONFIGURED;
          return (
            <div key={c.type} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-[family-name:var(--font-display)] font-medium">{c.name}</h3>
                  <p className="font-mono text-xs text-ink-soft">{c.api}</p>
                </div>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </div>

              {integ?.lastError ? (
                <p className="mt-2 rounded border border-iron/30 bg-iron/5 px-2 py-1 text-xs text-iron">
                  {integ.lastError}
                </p>
              ) : null}
              {integ?.lastSyncAt ? (
                <p className="mt-1 text-xs text-ink-soft">
                  Última verificação: {integ.lastSyncAt.toLocaleString("pt-BR")}
                </p>
              ) : null}

              <div className="mt-3">
                <p className="label mb-1">URL do webhook (cole no painel da Meta)</p>
                <CopyField value={`${base}/api/webhooks/${c.path}`} />
              </div>

              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs text-ink-soft">O que é necessário</summary>
                <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                  {c.prereqs.map((p) => (
                    <li key={p} className="flex gap-1.5">
                      <span className="text-line">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </details>

              <IntegrationForm
                type={c.type}
                current={{
                  status,
                  wabaId: integ?.wabaId ?? null,
                  phoneNumberId: integ?.phoneNumberId ?? null,
                  pageId: integ?.pageId ?? null,
                  igAccountId: integ?.igAccountId ?? null,
                  tokenMask: maskToken(integ?.encryptedToken ?? null),
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
