import Link from "next/link";

import { requireUser } from "@/lib/session";
import { seesAllSellers } from "@/lib/rbac";
import { listLeads } from "@/server/leads/queries";
import { CHANNEL_LABEL } from "@/lib/labels";
import { formatDate, relativeTime } from "@/lib/utils";
import { PageHeader, TemperatureBadge, EmptyState, Badge } from "@/components/ui";

export const metadata = { title: "Leads" };

const TEMP_FILTERS = [
  { key: "", label: "Todos" },
  { key: "HOT", label: "Quentes" },
  { key: "QUALIFIED", label: "Qualificados" },
  { key: "WARM", label: "Mornos" },
  { key: "COLD", label: "Frios" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = {
    temp: sp.temp,
    triage: sp.triage,
    q: sp.q,
    status: (sp.status as "open" | "won" | "lost") ?? "open",
  };
  const leads = await listLeads(user, filters);

  const qs = (patch: Record<string, string | undefined>) => {
    const merged = { ...sp, ...patch };
    const entries = Object.entries(merged).filter(([, v]) => v);
    return entries.length ? `?${new URLSearchParams(entries as [string, string][])}` : "";
  };

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Contatos com intenção comercial. Vendedor vê os próprios; gerente e admin veem todos."
        action={
          <Link href="/leads/new" className="btn-primary">
            Novo lead
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TEMP_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/leads${qs({ temp: f.key || undefined, triage: undefined })}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              (filters.temp ?? "") === f.key
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-ink-soft hover:bg-surface-2"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <Link
          href={`/leads${qs({ triage: sp.triage === "1" ? undefined : "1", temp: undefined })}`}
          className={`rounded-full border px-3 py-1 text-xs ${
            sp.triage === "1"
              ? "border-gold bg-gold/10 text-gold"
              : "border-line text-ink-soft hover:bg-surface-2"
          }`}
        >
          Triagem
        </Link>
        <div className="ml-auto flex gap-1 text-xs">
          {(["open", "won", "lost"] as const).map((s) => (
            <Link
              key={s}
              href={`/leads${qs({ status: s })}`}
              className={`rounded-md px-2 py-1 ${
                filters.status === s ? "bg-surface-2 font-medium" : "text-ink-soft"
              }`}
            >
              {s === "open" ? "Abertos" : s === "won" ? "Ganhos" : "Perdidos"}
            </Link>
          ))}
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="Nenhum lead com esses filtros"
          description="Ajuste os filtros ou crie um lead manualmente. Na Fase 3, os leads chegam sozinhos pelos canais."
          action={
            <Link href="/leads/new" className="btn-primary">
              Novo lead
            </Link>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-ink-soft">Contato</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-ink-soft">Assunto</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-ink-soft">Etapa</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-ink-soft">Temp.</th>
                <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-ink-soft">Score</th>
                {seesAllSellers(user.role) ? (
                  <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-ink-soft">Vendedor</th>
                ) : null}
                <th className="px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-ink-soft">Últ. contato</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:text-accent">
                      {lead.contact.displayName}
                    </Link>
                    <div className="text-xs text-ink-soft">{CHANNEL_LABEL[lead.channel] ?? lead.channel}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="line-clamp-1">{lead.title ?? "—"}</span>
                    <div className="text-xs text-ink-soft">
                      {lead.material?.commercialName ?? lead.materialText ?? "material não informado"}
                      {lead.squareMeters ? ` · ${lead.squareMeters} m²` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{lead.stage.name}</Badge>
                    {lead.isTriage ? <Badge tone="gold">triagem</Badge> : null}
                  </td>
                  <td className="px-4 py-3">
                    <TemperatureBadge value={lead.temperature} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{lead.score}</td>
                  {seesAllSellers(user.role) ? (
                    <td className="px-4 py-3 text-ink-soft">{lead.seller?.displayName ?? "—"}</td>
                  ) : null}
                  <td className="px-4 py-3 text-ink-soft" title={formatDate(lead.lastContactAt)}>
                    {relativeTime(lead.lastContactAt ?? lead.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
