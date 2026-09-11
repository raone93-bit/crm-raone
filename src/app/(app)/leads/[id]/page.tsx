import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/session";
import { can, seesAllSellers } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getLead, leadTimeline } from "@/server/leads/queries";
import {
  CHANNEL_LABEL,
  LANGUAGE_LABEL,
  MARKET_LABEL,
  INTENT_LABEL,
  LOST_REASON_LABEL,
  VERB_LABEL,
} from "@/lib/labels";
import { formatDate, formatDateTime, relativeTime } from "@/lib/utils";
import { PageHeader, Card, DataRow, TemperatureBadge, Badge } from "@/components/ui";
import {
  StageControl,
  LostControl,
  FollowUpControl,
  AssignControl,
  ConvertControl,
} from "./lead-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { title: true, contact: { select: { displayName: true } } },
  });
  return { title: lead?.title ?? lead?.contact.displayName ?? "Lead" };
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const lead = await getLead(user, id);
  if (!lead) notFound();

  const timeline = await leadTimeline(user.organizationId, lead.id, lead.contactId);
  const sellers = can(user.role, "assign", "lead")
    ? await prisma.seller.findMany({
        where: { organizationId: user.organizationId, active: true, isTriageQueue: false },
        orderBy: { displayName: "asc" },
      })
    : [];

  const isClosed = !!lead.wonAt || !!lead.lostAt;

  return (
    <div>
      <PageHeader
        title={lead.title ?? lead.contact.displayName}
        description={`${CHANNEL_LABEL[lead.channel] ?? lead.channel} · ${LANGUAGE_LABEL[lead.language] ?? lead.language}`}
        action={
          <Link href="/leads" className="btn-ghost">
            ← Leads
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="accent">{lead.stage.name}</Badge>
              <TemperatureBadge value={lead.temperature} />
              <span className="font-mono text-xs text-ink-soft">score {lead.score}/100</span>
              {lead.isTriage ? <Badge tone="gold">triagem</Badge> : null}
              {lead.wonAt ? <Badge tone="accent">ganho</Badge> : null}
              {lead.lostAt ? (
                <Badge tone="iron">
                  perdido · {LOST_REASON_LABEL[lead.lostReason ?? "OTHER"]}
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
              <DataRow label="Contato" value={<Link className="text-accent" href={`/clientes/${lead.contactId}`}>{lead.contact.displayName}</Link>} />
              <DataRow label="Empresa" value={lead.company?.name} />
              <DataRow label="Vendedor" value={lead.seller?.displayName} />
              <DataRow label="Idioma" value={LANGUAGE_LABEL[lead.language] ?? lead.language} />
              <DataRow label="Mercado" value={lead.market ? MARKET_LABEL[lead.market] : null} />
              <DataRow label="Intenção" value={lead.intentType ? INTENT_LABEL[lead.intentType] : null} />
              <DataRow label="País / Cidade" value={[lead.contact.country, lead.contact.city].filter(Boolean).join(" · ") || null} />
              <DataRow label="Origem" value={lead.sourceType} />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">
              Qualificação
            </h2>
            <p className="mb-3 text-xs text-ink-soft">
              Campos vazios não são preenchidos automaticamente — a IA nunca inventa dados (item 40).
            </p>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <DataRow label="Material" value={lead.material?.commercialName ?? lead.materialText} />
              <DataRow label="Tipo de pedra" value={lead.stoneType} />
              <DataRow label="Cor" value={lead.color} />
              <DataRow label="Espessura" value={lead.thicknessCm ? `${lead.thicknessCm} cm` : null} />
              <DataRow label="Acabamento" value={lead.finish} />
              <DataRow label="Quantidade" value={lead.quantitySlabs ? `${lead.quantitySlabs} chapas` : null} />
              <DataRow label="Metragem" value={lead.squareMeters ? `${lead.squareMeters} m²` : null} />
              <DataRow label="Prazo" value={lead.deadline ? formatDate(lead.deadline) : null} />
              <DataRow label="Faixa de preço" value={lead.priceRangeText} />
              <DataRow label="Projeto" value={lead.hasProject ? "Sim" : "—"} />
            </div>
            {lead.scoreFactors.length > 0 ? (
              <div className="mt-4">
                <p className="label mb-1.5">Fatores de score</p>
                <div className="flex flex-wrap gap-1.5">
                  {lead.scoreFactors.map((f) => (
                    <span key={f.id} className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft">
                      {f.factor} +{f.weight}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">
              Timeline
            </h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-ink-soft">Sem eventos ainda.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {timeline.map((a) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <div>
                      <p>
                        <span className="font-medium">{VERB_LABEL[a.verb] ?? a.verb}</span>
                        {a.summary ? <span className="text-ink-soft"> — {a.summary}</span> : null}
                      </p>
                      <p className="text-xs text-ink-soft">
                        {a.actorUser?.name ?? (a.actorType === "AI" ? "IA" : "Sistema")} ·{" "}
                        <time dateTime={a.createdAt.toISOString()} title={formatDateTime(a.createdAt)}>
                          {relativeTime(a.createdAt)}
                        </time>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          {can(user.role, "edit", "lead") && !isClosed ? (
            <Card className="p-4">
              <p className="label mb-2">Etapa</p>
              <StageControl
                leadId={lead.id}
                currentStageId={lead.stageId}
                stages={lead.funnel.stages.map((s) => ({ id: s.id, name: s.name, isLost: s.isLost }))}
              />
            </Card>
          ) : null}

          {can(user.role, "edit", "lead") && !isClosed ? (
            <Card className="p-4">
              <p className="label mb-2">Follow-up</p>
              {lead.followUps.length > 0 ? (
                <p className="mb-2 text-xs text-ink-soft">
                  Próximo: {formatDateTime(lead.followUps[0].dueAt)}
                </p>
              ) : null}
              <FollowUpControl leadId={lead.id} />
            </Card>
          ) : null}

          {can(user.role, "assign", "lead") ? (
            <Card className="p-4">
              <p className="label mb-2">Atribuição</p>
              <AssignControl
                leadId={lead.id}
                currentSellerId={lead.sellerId}
                sellers={sellers.map((s) => ({ id: s.id, displayName: s.displayName }))}
              />
            </Card>
          ) : null}

          {can(user.role, "create", "quote") ? (
            <Card className="p-4">
              <p className="label mb-2">Comercial</p>
              <Link href={`/cotacoes/new?lead=${lead.id}`} className="btn-ghost w-full text-xs">
                Criar cotação
              </Link>
            </Card>
          ) : null}

          {can(user.role, "create", "customer") ? (
            <Card className="p-4">
              <p className="label mb-2">Cliente</p>
              <ConvertControl leadId={lead.id} alreadyCustomer={!!lead.contact.customer} />
            </Card>
          ) : null}

          {can(user.role, "edit", "lead") && !isClosed ? (
            <LostControl leadId={lead.id} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
