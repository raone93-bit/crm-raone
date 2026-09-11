import Link from "next/link";

import { requireUser } from "@/lib/session";
import { seesAllSellers } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { QUOTE_STATUS_LABEL } from "@/lib/labels";
import { formatMoney, formatDate } from "@/lib/utils";
import { PageHeader, EmptyState, Badge } from "@/components/ui";

export const metadata = { title: "Cotações" };

const TONE: Record<string, "default" | "accent" | "iron" | "gold"> = {
  DRAFT: "default",
  SENT: "gold",
  APPROVED: "accent",
  REJECTED: "iron",
  EXPIRED: "iron",
  CONVERTED: "accent",
};

export default async function CotacoesPage() {
  const user = await requireUser();
  const quotes = await prisma.quote.findMany({
    where: {
      organizationId: user.organizationId,
      ...(seesAllSellers(user.role) ? {} : { ownerUserId: user.id }),
    },
    include: { customer: { include: { contact: true, company: true } }, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Cotações"
        description="Da cotação ao pedido. Gera PDF, controla status e converte em pedido."
        action={
          <Link href="/cotacoes/new" className="btn-primary">
            Nova cotação
          </Link>
        }
      />

      {quotes.length === 0 ? (
        <EmptyState title="Nenhuma cotação" description="Crie a partir de um lead ou avulsa." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase text-ink-soft">
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Itens</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Criada</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/cotacoes/${q.id}`} className="font-medium hover:text-accent">
                      {q.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {q.customer?.company?.name ?? q.customer?.contact?.displayName ?? q.customer?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{q._count.items}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(q.total, q.currency)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[q.status] ?? "default"}>{QUOTE_STATUS_LABEL[q.status] ?? q.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{formatDate(q.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
