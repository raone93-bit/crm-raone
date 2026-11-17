import { requireRole } from "@/lib/session";
import { getSellers } from "@/lib/cached";
import { getSellerStats } from "@/server/sellers/stats";
import { LANGUAGE_LABEL } from "@/lib/labels";
import { PageHeader, Card, StatTile } from "@/components/ui";

export const metadata = { title: "Vendedores" };

export default async function VendedoresPage() {
  const user = await requireRole("ADMIN", "MANAGER");

  const sellers = await getSellers(user.organizationId);
  const statsBySeller = await getSellerStats(user.organizationId, sellers);

  const stats = sellers.map((s) => {
    const r = statsBySeller.get(s.id)!;
    return { seller: s, open: r.open, hot: r.hot, wonMonth: r.wonMonth, lostMonth: r.lostMonth, overdue: r.overdue, noFollowUp: r.noFollowUp };
  });

  return (
    <div>
      <PageHeader
        title="Vendedores"
        description="Desempenho por vendedor. Cada um vê apenas o próprio funil; o gerente vê todos."
      />

      <div className="flex flex-col gap-5">
        {stats.map(({ seller, open, hot, wonMonth, lostMonth, overdue, noFollowUp }) => (
          <Card key={seller.id}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg font-medium">
                  {seller.displayName}
                </h2>
                <p className="text-xs text-ink-soft">
                  {seller.user.email}
                  {seller.isTriageQueue ? " · fila de triagem" : ""}
                  {seller.languages.length > 0
                    ? ` · ${seller.languages.map((l) => LANGUAGE_LABEL[l] ?? l).join(", ")}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Leads abertos" value={open} />
              <StatTile label="Quentes" value={hot} tone="iron" />
              <StatTile label="Ganhos no mês" value={wonMonth} tone="accent" />
              <StatTile label="Perdidos no mês" value={lostMonth} />
              <StatTile label="Follow-ups atrasados" value={overdue} tone={overdue > 0 ? "gold" : "default"} />
              <StatTile label="Sem próximo passo" value={noFollowUp} tone={noFollowUp > 0 ? "gold" : "default"} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
