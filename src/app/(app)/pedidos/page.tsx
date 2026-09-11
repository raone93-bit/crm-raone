import Link from "next/link";

import { requireUser } from "@/lib/session";
import { seesAllSellers } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL, MARKET_LABEL } from "@/lib/labels";
import { formatMoney, formatDate } from "@/lib/utils";
import { PageHeader, EmptyState, Badge } from "@/components/ui";

export const metadata = { title: "Pedidos" };

export default async function PedidosPage() {
  const user = await requireUser();
  const orders = await prisma.order.findMany({
    where: {
      organizationId: user.organizationId,
      ...(seesAllSellers(user.role) ? {} : { ownerUserId: user.id }),
    },
    include: {
      customer: { include: { contact: true, company: true } },
      shipment: { select: { status: true } },
      _count: { select: { payments: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader title="Pedidos" description="Nascidos de cotações aprovadas. Pagamentos e logística de exportação." />

      {orders.length === 0 ? (
        <EmptyState title="Nenhum pedido" description="Converta uma cotação em pedido." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase text-ink-soft">
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Mercado</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Carga</th>
                <th className="px-4 py-3">Criado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/pedidos/${o.id}`} className="font-medium hover:text-accent">
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {o.customer?.company?.name ?? o.customer?.contact?.displayName ?? o.customer?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{MARKET_LABEL[o.market] ?? o.market}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(o.total, o.currency)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={o.status === "DELIVERED" ? "accent" : o.status === "CANCELLED" ? "iron" : "gold"}>
                      {ORDER_STATUS_LABEL[o.status] ?? o.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{o.shipment ? "acompanhada" : "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
