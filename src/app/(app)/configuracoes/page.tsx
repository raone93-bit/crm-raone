import { PageHeader, Card } from "@/components/ui";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Configurações" };

const LANG_LABEL: Record<string, string> = { PT: "Português", ES: "Espanhol", EN: "Inglês", OTHER: "Outros" };

export default async function Page() {
  const user = await requireRole("ADMIN", "MANAGER");

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [rules, stages, aiAgg, aiCount] = await Promise.all([
    prisma.routingRule.findMany({
      where: { organizationId: user.organizationId },
      include: { seller: true },
      orderBy: { language: "asc" },
    }),
    prisma.funnelStage.findMany({
      where: { funnel: { organizationId: user.organizationId, isDefault: true } },
      orderBy: { position: "asc" },
    }),
    prisma.aiAnalysis.aggregate({
      where: { organizationId: user.organizationId, createdAt: { gte: startOfMonth } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    }),
    prisma.aiAnalysis.count({
      where: { organizationId: user.organizationId, createdAt: { gte: startOfMonth }, source: { not: "heuristic" } },
    }),
  ]);

  const aiProvider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const aiKeySet = aiProvider === "openai" ? !!process.env.OPENAI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
  const aiModel = process.env.AI_MODEL || (aiProvider === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Distribuição de leads por idioma e etapas do funil. Editável — são dados, não código."
      />

      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium">
          IA de qualificação
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Analisa cada nova mensagem: idioma, intenção comercial, extração de dados,
          score, resumo e resposta sugerida. Sem chave configurada, o CRM usa a
          heurística determinística.
        </p>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-line py-2">
            <span className="text-ink-soft">Provedor</span>
            <span className="font-medium">{aiProvider === "openai" ? "OpenAI" : "Claude (Anthropic)"}</span>
          </div>
          <div className="flex justify-between border-b border-line py-2">
            <span className="text-ink-soft">Status</span>
            <span className={`font-medium ${aiKeySet ? "text-accent" : "text-gold"}`}>
              {aiKeySet ? "ativo" : "heurística (sem chave)"}
            </span>
          </div>
          <div className="flex justify-between border-b border-line py-2">
            <span className="text-ink-soft">Modelo</span>
            <span className="font-mono text-xs">{aiModel}</span>
          </div>
          <div className="flex justify-between border-b border-line py-2">
            <span className="text-ink-soft">Análises IA no mês</span>
            <span className="tabular-nums">{aiCount}</span>
          </div>
          <div className="flex justify-between border-b border-line py-2">
            <span className="text-ink-soft">Custo no mês (est.)</span>
            <span className="tabular-nums">
              US$ {(aiAgg._sum.costUsd ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between border-b border-line py-2">
            <span className="text-ink-soft">Tokens no mês</span>
            <span className="tabular-nums">
              {((aiAgg._sum.inputTokens ?? 0) + (aiAgg._sum.outputTokens ?? 0)).toLocaleString("pt-BR")}
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Configuração por variáveis de ambiente: <code>AI_PROVIDER</code>,{" "}
          <code>ANTHROPIC_API_KEY</code>, <code>AI_MODEL</code>.
        </p>
      </Card>

      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium">
          Roteamento por idioma
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Idioma da conversa define o vendedor (item 12). Edição inline entra na Fase 1.
        </p>
        <div className="mt-4 divide-y divide-line">
          {rules.map((r) => (
            <div key={r.id} className="flex justify-between py-2 text-sm">
              <span>{LANG_LABEL[r.language] ?? r.language}</span>
              <span className="font-medium">{r.seller.displayName}</span>
            </div>
          ))}
          {rules.length === 0 ? (
            <p className="py-2 text-sm text-ink-soft">Nenhuma regra. Rode o seed.</p>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium">
          Etapas do funil
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {stages.length} etapas. Reordenar e renomear entra na Fase 1.
        </p>
        <ol className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
          {stages.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="font-mono text-xs text-ink-soft">{String(s.position).padStart(2, "0")}</span>
              {s.name}
              {s.isWon ? <span className="text-accent">✓</span> : null}
              {s.isLost ? <span className="text-iron">✕</span> : null}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
