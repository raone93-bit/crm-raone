import Link from "next/link";

import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { listConversations, getConversation } from "@/server/conversations/queries";
import { CHANNEL_LABEL, LANGUAGE_LABEL, INTENT_LABEL } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";
import { TemperatureBadge, Badge, DataRow } from "@/components/ui";
import { ConversationList } from "./conversation-list";
import { ReplyBox } from "./reply-box";
import { ThreadActions } from "./thread-actions";
import { Simulator } from "./simulator";

export const metadata = { title: "Conversas" };

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await searchParams;

  const [conversations, integration] = await Promise.all([
    listConversations(user, {}),
    prisma.integration.findFirst({ where: { organizationId: user.organizationId, status: "CONNECTED" } }),
  ]);
  const channelReady = !!integration;

  const conversation = id ? await getConversation(user, id) : null;
  const sellers = can(user.role, "assign", "conversation")
    ? await prisma.seller.findMany({
        where: { organizationId: user.organizationId, active: true, isTriageQueue: false },
        orderBy: { displayName: "asc" },
      })
    : [];

  const listItems = conversations.map((c) => ({
    id: c.id,
    contactName: c.contact.displayName,
    channel: c.channel,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    unreadCount: c.unreadCount,
    sellerName: c.seller?.displayName ?? null,
    status: c.status,
  }));

  const lead = conversation?.contact.leads[0] ?? null;

  // Última análise de IA de uma mensagem do cliente.
  const lastAnalysis = conversation
    ? [...conversation.messages]
        .reverse()
        .find((m) => m.direction === "INBOUND" && m.aiAnalysis)?.aiAnalysis ?? null
    : null;
  const suggestion = lastAnalysis?.suggestedReply ?? null;
  const aiSummary = lastAnalysis?.summary ?? null;

  return (
    <div className="-m-4 flex h-[calc(100dvh-3.5rem)] overflow-hidden lg:-m-6">
      <div className={cn("w-full shrink-0 border-r border-line lg:w-80", id ? "hidden lg:block" : "block")}>
        <ConversationList items={listItems} />
      </div>

      {conversation ? (
        <div className="flex min-w-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <Link href="/conversas" className="btn-ghost h-8 px-2 text-xs lg:hidden">
                  ←
                </Link>
                <div>
                  <p className="font-medium">{conversation.contact.displayName}</p>
                  <p className="text-xs text-ink-soft">
                    {CHANNEL_LABEL[conversation.channel] ?? conversation.channel}
                    {conversation.seller ? ` · ${conversation.seller.displayName}` : ""}
                  </p>
                </div>
              </div>
              <ThreadActions
                conversationId={conversation.id}
                status={conversation.status}
                unread={conversation.unreadCount}
                canAssign={can(user.role, "assign", "conversation")}
                sellers={sellers.map((s) => ({ id: s.id, displayName: s.displayName }))}
                currentSellerId={conversation.assignedSellerId}
              />
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-ground px-4 py-4">
              {conversation.messages.length === 0 ? (
                <p className="text-center text-sm text-ink-soft">Sem mensagens.</p>
              ) : (
                conversation.messages.map((m) => {
                  const out = m.direction === "OUTBOUND";
                  return (
                    <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                          out ? "bg-accent text-white" : "border border-line bg-surface",
                        )}
                      >
                        {m.type !== "TEXT" ? (
                          <p className="mb-1 text-xs opacity-80">
                            [{m.type.toLowerCase()}] {m.mediaFileName ?? ""}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap">{m.text}</p>
                        <p className={cn("mt-1 text-[10px]", out ? "text-white/70" : "text-ink-soft")}>
                          {formatDateTime(m.externalTimestamp ?? m.createdAt)}
                          {out ? ` · ${m.status === "QUEUED" ? "na fila" : m.status.toLowerCase()}` : ""}
                        </p>
                        {out && m.errorMessage ? (
                          <p className="mt-0.5 text-[10px] text-white/80">{m.errorMessage}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {can(user.role, "edit", "conversation") ? (
              <ReplyBox
                conversationId={conversation.id}
                channelReady={channelReady}
                suggestion={suggestion}
              />
            ) : null}
          </div>

          <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-line p-4 xl:block">
            {aiSummary ? (
              <div className="mb-4 rounded-md border border-accent/30 bg-accent-soft/40 p-3">
                <p className="label mb-1 text-accent">Resumo da IA</p>
                <p className="text-sm text-ink">{aiSummary}</p>
              </div>
            ) : null}
            <p className="label mb-3">Painel do lead</p>
            {lead ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{lead.stage.name}</Badge>
                  <TemperatureBadge value={lead.temperature} />
                  <span className="font-mono text-xs text-ink-soft">{lead.score}/100</span>
                </div>
                <div>
                  <DataRow label="Material" value={lead.material?.commercialName ?? lead.materialText} />
                  <DataRow label="Espessura" value={lead.thicknessCm ? `${lead.thicknessCm} cm` : null} />
                  <DataRow label="Metragem" value={lead.squareMeters ? `${lead.squareMeters} m²` : null} />
                  <DataRow label="Quantidade" value={lead.quantitySlabs ? `${lead.quantitySlabs} chapas` : null} />
                  <DataRow label="Idioma" value={LANGUAGE_LABEL[lead.language] ?? lead.language} />
                  <DataRow label="Intenção" value={lead.intentType ? INTENT_LABEL[lead.intentType] : null} />
                  <DataRow label="Vendedor" value={lead.seller?.displayName} />
                  <DataRow label="Projeto" value={lead.hasProject ? "Sim" : "—"} />
                </div>
                <Link href={`/leads/${lead.id}`} className="btn-ghost w-full text-xs">
                  Abrir lead completo
                </Link>
              </div>
            ) : (
              <div className="text-sm text-ink-soft">
                <p>Nenhum lead ativo para este contato.</p>
                <p className="mt-1 text-xs">
                  Um lead nasce quando há intenção comercial na conversa (item 2).
                  Elogios e saudações não geram lead.
                </p>
                <Link href={`/clientes/${conversation.contactId}`} className="btn-ghost mt-3 w-full text-xs">
                  Ver contato
                </Link>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="hidden flex-1 overflow-y-auto p-8 lg:block">
          <div className="mx-auto max-w-lg">
            <p className="mb-6 text-sm text-ink-soft">Selecione uma conversa à esquerda.</p>
            {user.role === "ADMIN" ? <Simulator /> : null}
          </div>
        </div>
      )}
    </div>
  );
}
