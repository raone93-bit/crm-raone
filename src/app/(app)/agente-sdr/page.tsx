import { PageHeader, Card, StatTile } from "@/components/ui";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { SdrSettingsForm } from "./settings-form";
import { appUrl, vapiConfigured } from "@/server/voice/config";

export const metadata = { title: "Agente SDR" };

const DEFAULT_CRITERIA = `Lead qualificado quando sabemos:
- Tipo de empresa: importador, distribuidor ou marmoraria (fabricator)
- País e porto de destino
- Material(is) de interesse, espessura (2 cm / 3 cm) e acabamento
- Volume: m², nº de chapas ou containers por mês
- Prazo do projeto ou da próxima compra`;

const DEFAULT_KB = `SOBRE A EMPRESA
Toledo Mineração — exportadora brasileira de rochas naturais (Espírito Santo).
[descreva em 2-3 linhas: tempo de mercado, pedreiras próprias, mercados atendidos]

MATERIAIS (preencha com o portfólio real)
- [Nome comercial] — [tipo: granito/quartzito/mármore], [cor/aspecto]
- Ex.: Black Taurus — [tipo], [cor]

FORMATOS E ACABAMENTOS
- Espessuras: [2 cm, 3 cm…]
- Acabamentos: [polido, apicoado, leather/escovado…]
- Formato: chapas em bundles; [blocos?]

EXPORTAÇÃO
- Incoterms trabalhados: [FOB, CFR, CIF…]
- Pedido mínimo: [ex.: 1 container de 20']
- Portos de embarque: [Vitória…]

O QUE O AGENTE PODE OFERECER
- Fotos/vídeos dos bundles: o vendedor envia
- Amostras: [sim/não, como funciona]
- Ligação ou videochamada com um especialista`;

export default async function Page() {
  const user = await requireRole("ADMIN");
  const orgId = user.organizationId;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [settings, users, replies, handoffs, calls, paused, log, voiceCalls] = await Promise.all([
    prisma.sdrSettings.findUnique({ where: { organizationId: orgId } }),
    prisma.user.findMany({ where: { organizationId: orgId, active: true }, orderBy: { name: "asc" } }),
    prisma.message.count({ where: { organizationId: orgId, sentByAi: true, createdAt: { gte: weekAgo } } }),
    prisma.activity.count({ where: { organizationId: orgId, verb: "ai_handoff", createdAt: { gte: weekAgo } } }),
    prisma.activity.count({ where: { organizationId: orgId, verb: "scheduled_call", createdAt: { gte: weekAgo } } }),
    prisma.conversation.count({ where: { organizationId: orgId, aiPaused: true, status: { not: "CLOSED" } } }),
    prisma.activity.findMany({
      where: {
        organizationId: orgId,
        actorType: "AI",
        verb: { in: ["ai_replied", "ai_handoff", "scheduled_call", "opted_out", "ai_error", "call_queued", "call_ended"] },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.activity.count({ where: { organizationId: orgId, verb: "call_ended", createdAt: { gte: weekAgo } } }),
  ]);

  const keySet = !!process.env.ANTHROPIC_API_KEY;
  const current = {
    enabled: settings?.enabled ?? false,
    channels: settings?.channels ?? ["WHATSAPP", "INSTAGRAM", "FACEBOOK"],
    agentName: settings?.agentName ?? "Equipe Comercial",
    companyName: settings?.companyName ?? "Toledo Mineração",
    knowledgeBase: settings?.knowledgeBase || DEFAULT_KB,
    qualificationCriteria: settings?.qualificationCriteria || DEFAULT_CRITERIA,
    handoffUserId: settings?.handoffUserId ?? null,
    maxRepliesPerDay: settings?.maxRepliesPerDay ?? 15,
    model: settings?.model ?? null,
    voiceEnabled: settings?.voiceEnabled ?? false,
    vapiPhoneNumberId: settings?.vapiPhoneNumberId ?? null,
    voiceReactivationEnabled: settings?.voiceReactivationEnabled ?? false,
    reactivationAfterDays: settings?.reactivationAfterDays ?? 7,
    maxCallsPerDay: settings?.maxCallsPerDay ?? 10,
    voiceProvider: settings?.voiceProvider ?? "11labs",
    voiceModel: settings?.voiceModel ?? "eleven_flash_v2_5",
    voiceId: settings?.voiceId ?? null,
  };
  const vapiReady = vapiConfigured();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agente SDR"
        description="Atende WhatsApp, Instagram e Messenger sozinho e, com a voz ligada, também liga e atende telefone: responde no idioma do cliente, qualifica, registra no lead e passa para um vendedor. Nunca informa preço, prazo ou condição de pagamento."
      />

      {!keySet ? (
        <Card className="border-gold/40">
          <p className="text-sm">
            Falta a chave <code>ANTHROPIC_API_KEY</code> nas variáveis de ambiente da Vercel. Sem ela o agente não responde.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Status" value={current.enabled && keySet ? "Ligado" : "Desligado"} tone={current.enabled && keySet ? "accent" : "gold"} />
        <StatTile label="Respostas (7 dias)" value={replies} />
        <StatTile label="Passados ao vendedor" value={handoffs} hint="7 dias" />
        <StatTile
          label="Ligações (7 dias)"
          value={voiceCalls}
          hint={`${calls} agendada(s) · ${paused} conversa(s) com agente pausado`}
          href="/tarefas"
        />
      </div>

      <Card>
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg font-medium">Configuração</h2>
        <SdrSettingsForm
          current={current}
          users={users.map((u) => ({ id: u.id, name: u.name ?? u.email }))}
          vapiReady={vapiReady}
          webhookUrl={`${appUrl()}/api/webhooks/vapi`}
        />
      </Card>

      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium">Atividade recente</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Para testar sem a Meta, use o simulador em Conversas — ele também aciona o agente.
        </p>
        <div className="mt-4 divide-y divide-line">
          {log.length === 0 ? <p className="py-2 text-sm text-ink-soft">Nada ainda.</p> : null}
          {log.map((a) => (
            <div key={a.id} className="flex justify-between gap-4 py-2 text-sm">
              <span className={a.verb === "ai_error" ? "text-iron" : ""}>{a.summary}</span>
              <span className="shrink-0 text-xs text-ink-soft">{formatDateTime(a.createdAt)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
