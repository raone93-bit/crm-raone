import Link from "next/link";

import { requireRole } from "@/lib/session";
import { getReports } from "@/server/reports/queries";
import { formatMoney } from "@/lib/utils";
import { PageHeader, Card, StatTile } from "@/components/ui";
import { MiniBars } from "@/components/mini-bars";

export const metadata = { title: "Relatórios" };

const PERIODS = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "year", label: "Ano" },
];

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireRole("ADMIN", "MANAGER");
  const sp = await searchParams;
  const period = sp.p ?? "30d";
  const r = await getReports(user.organizationId, period);
  const t = r.tiles;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Relatórios"
        description="Desempenho comercial por vendedor, canal, idioma, material e mercado."
        action={
          <div className="flex gap-1 text-xs">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/relatorios?p=${p.key}`}
                className={`rounded-md px-2 py-1 ${period === p.key ? "bg-surface-2 font-medium" : "text-ink-soft"}`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Leads no período" value={t.totalLeads} />
        <StatTile label="Ganhos" value={t.wonLeads} tone="accent" />
        <StatTile label="Conversão" value={`${t.conversion}%`} tone={t.conversion >= 20 ? "accent" : "default"} />
        <StatTile label="Perdidos" value={t.lostLeads} tone="iron" />
        <StatTile label="Cotações" value={t.quotes} hint={formatMoney(t.quotesValue, "USD")} />
        <StatTile label="Pedidos" value={t.orders} tone="accent" hint={formatMoney(t.ordersValue, "USD")} />
        <StatTile label="Ticket médio" value={formatMoney(t.ticket, "USD")} />
        <StatTile
          label="Tempo até cotação"
          value={t.timeToQuote != null ? `${t.timeToQuote} d` : "—"}
          hint={t.timeToWon != null ? `${t.timeToWon} d até a venda` : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Leads por vendedor</h2>
          <MiniBars items={r.bySeller} kind="plain" />
        </Card>
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Leads por canal</h2>
          <MiniBars items={r.byChannel} kind="plain" />
        </Card>
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Leads por idioma</h2>
          <MiniBars items={r.byLanguage} kind="plain" />
        </Card>
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Leads por mercado</h2>
          <MiniBars items={r.byCountry} kind="plain" />
        </Card>
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Materiais mais procurados</h2>
          <MiniBars items={r.byMaterial} kind="plain" />
        </Card>
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Motivos de perda</h2>
          {r.lostReasons.length > 0 ? (
            <MiniBars items={r.lostReasons} kind="plain" />
          ) : (
            <p className="text-sm text-ink-soft">Nenhum lead perdido no período.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
