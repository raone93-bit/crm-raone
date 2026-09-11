import Link from "next/link";

import { requireUser } from "@/lib/session";
import { seesAllSellers } from "@/lib/rbac";
import { getDashboard } from "@/server/dashboard";
import { PageHeader, StatTile, Card } from "@/components/ui";
import { MiniBars, FunnelBars } from "@/components/mini-bars";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await getDashboard(user);
  const t = d.tiles;

  const greeting = user.name ? `Olá, ${user.name.split(" ")[0]}` : "Dashboard";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={greeting}
        description={
          seesAllSellers(user.role)
            ? "Visão geral do comercial — todos os vendedores."
            : "Seus leads e tarefas."
        }
        action={
          <Link href="/leads/new" className="btn-primary">
            Novo lead
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Leads hoje" value={t.leadsToday} hint={`${t.leadsWeek} nos últimos 7 dias`} href="/leads" />
        <StatTile label="Leads quentes" value={t.hotLeads} tone="iron" href="/leads?temp=HOT" />
        <StatTile label="Conversas pendentes" value={t.openConversations} href="/conversas" />
        <StatTile
          label="Follow-ups atrasados"
          value={t.overdueFollowUps}
          tone={t.overdueFollowUps > 0 ? "gold" : "default"}
          href="/tarefas"
        />
        <StatTile label="Cotações abertas" value={t.openQuotes} href="/cotacoes" />
        <StatTile label="Vendas no mês" value={t.wonThisMonth} tone="accent" />
        <StatTile
          label="Na triagem"
          value={t.triageCount}
          tone={t.triageCount > 0 ? "gold" : "default"}
          hint="Idioma indefinido"
          href="/leads?triage=1"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg font-medium">Funil</h2>
          <FunnelBars stages={d.stageCounts} />
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Origem</h2>
            <MiniBars items={d.byChannel} kind="channel" />
          </Card>
          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Idioma</h2>
            <MiniBars items={d.byLanguage} kind="language" />
          </Card>
        </div>
      </div>

      {seesAllSellers(user.role) && d.bySeller.length > 0 ? (
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-lg font-medium">Leads por vendedor</h2>
          <MiniBars items={d.bySeller.map((s) => ({ label: s.name, count: s.count }))} kind="plain" />
        </Card>
      ) : null}
    </div>
  );
}
