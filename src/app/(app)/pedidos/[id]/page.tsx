import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  ORDER_STATUS_LABEL,
  MARKET_LABEL,
  INCOTERM_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/labels";
import { formatMoney, formatDate } from "@/lib/utils";
import { PageHeader, Card, DataRow, Badge } from "@/components/ui";
import { OrderStatusSelect, AddPaymentForm, MarkPaidButton } from "./order-actions";
import { createShipment } from "@/server/shipments/actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const o = await prisma.order.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { number: true },
  });
  return { title: o?.number ?? "Pedido" };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const order = await prisma.order.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      items: true,
      customer: { include: { contact: true, company: true } },
      quote: true,
      owner: true,
      payments: { orderBy: { createdAt: "asc" } },
      shipment: true,
    },
  });
  if (!order) notFound();

  const paid = order.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
  const editable = can(user.role, "edit", "order");

  return (
    <div>
      <PageHeader
        title={order.number}
        description={
          order.customer?.company?.name ??
          order.customer?.contact?.displayName ??
          order.customer?.name ??
          "Pedido"
        }
        action={
          <Link href="/pedidos" className="btn-ghost">
            ← Pedidos
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Itens</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase text-ink-soft">
                    <th className="py-2 pr-3">Descrição</th>
                    <th className="py-2 pr-3">m²</th>
                    <th className="py-2 pr-3">Preço/m²</th>
                    <th className="py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it) => (
                    <tr key={it.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3">{it.description}</td>
                      <td className="py-2 pr-3 tabular-nums">{it.squareMeters ?? "—"}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatMoney(it.unitPrice, order.currency)}</td>
                      <td className="py-2 tabular-nums">{formatMoney(it.lineTotal, order.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end text-sm font-medium">
              Total: {formatMoney(order.total, order.currency)}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-base font-medium">
                Pagamentos
              </h2>
              <span className="text-sm text-ink-soft">
                {formatMoney(paid, order.currency)} de {formatMoney(order.total, order.currency)}
              </span>
            </div>
            {order.payments.length > 0 ? (
              <ul className="mb-4 flex flex-col gap-1.5 text-sm">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                    <span>
                      {formatMoney(p.amount, p.currency)}
                      {p.dueDate ? <span className="text-xs text-ink-soft"> · vence {formatDate(p.dueDate)}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={p.status === "PAID" ? "accent" : p.status === "OVERDUE" ? "iron" : "gold"}>
                        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                      {editable && p.status !== "PAID" ? <MarkPaidButton paymentId={p.id} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-ink-soft">Nenhuma parcela registrada.</p>
            )}
            {editable ? <AddPaymentForm orderId={order.id} /> : null}
          </Card>

          <Card>
            <h2 className="mb-2 font-[family-name:var(--font-display)] text-base font-medium">Logística</h2>
            {order.shipment ? (
              <p className="text-sm">
                <Link href={`/exportacao/${order.shipment.id}`} className="text-accent hover:underline">
                  Abrir embarque →
                </Link>
              </p>
            ) : editable && order.market !== "DOMESTIC" ? (
              <form action={createShipment}>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" className="btn-ghost text-xs">
                  Abrir embarque de exportação
                </button>
              </form>
            ) : (
              <p className="text-sm text-ink-soft">
                {order.market === "DOMESTIC" ? "Pedido de mercado interno." : "Sem embarque aberto."}
              </p>
            )}
          </Card>
        </div>

        <Card>
          {editable ? (
            <div className="mb-3">
              <span className="label">Status</span>
              <OrderStatusSelect orderId={order.id} status={order.status} />
            </div>
          ) : (
            <div className="mb-3">
              <span className="label">Status</span>
              <p className="mt-1">
                <Badge>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
              </p>
            </div>
          )}
          <div className="grid">
            <DataRow label="Mercado" value={MARKET_LABEL[order.market] ?? order.market} />
            <DataRow label="Destino" value={order.destination} />
            <DataRow label="Moeda" value={order.currency} />
            <DataRow
              label="Incoterm"
              value={order.incoterm ? INCOTERM_LABEL[order.incoterm] ?? order.incoterm : null}
            />
            <DataRow label="Pagamento" value={order.paymentTerms} />
            <DataRow
              label="Cotação"
              value={
                order.quote ? (
                  <Link className="text-accent" href={`/cotacoes/${order.quote.id}`}>
                    {order.quote.number}
                  </Link>
                ) : null
              }
            />
            <DataRow label="Vendedor" value={order.owner?.name} />
            <DataRow label="Criado" value={formatDate(order.createdAt)} />
          </div>
        </Card>
      </div>
    </div>
  );
}
