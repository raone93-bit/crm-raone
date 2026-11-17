import Link from "next/link";

import { requireUser } from "@/lib/session";
import { seesAllSellers } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL, MARKET_LABEL } from "@/lib/labels";
import { formatMoney, formatDate } from "@/lib/utils";
import { PageHeader, EmptyState, Badge, Pager } from "@/components/ui";

export const metadata = { title: "Pedidos" };

const PAGE_SIZE = 50;

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Number(sp.page) > 1 ? Math.floor(Number(sp.page)) : 1;
  const rows = await prisma.order.findMany({
    where: {
      organizationId: user.organizationId,
      ...(seesAllSellers(user.role) ? {} : { ownerUserId: user.id }),
    },
    select: {
      id: true,
      number: true,
      market: true,
      total: true,
      currency: true,
      status: true,
      createdAt: true,
      customer: { select: { name: true, contact: { select: { displayName: true } }, company: { select: { name: true } } } },
      shipment: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const orders = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

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
      <Pager page={page} hasMore={hasMore} hrefFor={(p) => (p > 1 ? "/pedidos?page=" + p : "/pedidos")} />
    </div>
  );
}
