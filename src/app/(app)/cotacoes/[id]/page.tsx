import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { QUOTE_STATUS_LABEL, INCOTERM_LABEL, FINISH_LABEL } from "@/lib/labels";
import { formatMoney, formatDate } from "@/lib/utils";
import { PageHeader, Card, DataRow, Badge } from "@/components/ui";
import { AddItemForm, DeleteItemButton, QuoteStatusBar } from "./quote-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const q = await prisma.quote.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { number: true },
  });
  return { title: q?.number ?? "Cotação" };
}

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const quote = await prisma.quote.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      items: { orderBy: { position: "asc" }, include: { material: true } },
      customer: { include: { contact: true, company: true } },
      project: true,
      lead: true,
      owner: true,
      order: true,
    },
  });
  if (!quote) notFound();

  const materials = can(user.role, "edit", "quote")
    ? await prisma.material.findMany({
        where: { organizationId: user.organizationId, active: true },
        orderBy: { commercialName: "asc" },
        select: { id: true, commercialName: true },
      })
    : [];

  const editable = can(user.role, "edit", "quote") && quote.status !== "CONVERTED";

  return (
    <div>
      <PageHeader
        title={quote.number}
        description={
          quote.customer?.company?.name ??
          quote.customer?.contact?.displayName ??
          quote.customer?.name ??
          "Cotação"
        }
        action={
          <Link href="/cotacoes" className="btn-ghost">
            ← Cotações
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={quote.status === "APPROVED" || quote.status === "CONVERTED" ? "accent" : quote.status === "REJECTED" ? "iron" : "gold"}>
            {QUOTE_STATUS_LABEL[quote.status] ?? quote.status}
          </Badge>
          {quote.order ? (
            <Link href={`/pedidos/${quote.order.id}`} className="text-sm text-accent hover:underline">
              → Pedido {quote.order.number}
            </Link>
          ) : null}
        </div>
        {can(user.role, "view", "quote") ? (
          <QuoteStatusBar
            quoteId={quote.id}
            status={quote.status}
            hasItems={quote.items.length > 0}
            hasOrder={!!quote.order}
          />
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Itens</h2>
            {quote.items.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhum item ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase text-ink-soft">
                      <th className="py-2 pr-3">Descrição</th>
                      <th className="py-2 pr-3">m²</th>
                      <th className="py-2 pr-3">Preço/m²</th>
                      <th className="py-2 pr-3">Total</th>
                      {editable ? <th className="py-2" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {quote.items.map((it) => (
                      <tr key={it.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-3">
                          {it.material?.commercialName ?? it.description}
                          <span className="text-xs text-ink-soft">
                            {it.thicknessCm ? ` · ${it.thicknessCm} cm` : ""}
                            {it.finish ? ` · ${FINISH_LABEL[it.finish] ?? it.finish}` : ""}
                          </span>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{it.squareMeters ?? "—"}</td>
                        <td className="py-2 pr-3 tabular-nums">{formatMoney(it.unitPrice, quote.currency)}</td>
                        <td className="py-2 pr-3 tabular-nums">{formatMoney(it.lineTotal, quote.currency)}</td>
                        {editable ? (
                          <td className="py-2">
                            <DeleteItemButton itemId={it.id} />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex flex-col items-end gap-1 text-sm">
              <div className="flex w-56 justify-between">
                <span className="text-ink-soft">Subtotal</span>
                <span className="tabular-nums">{formatMoney(quote.subtotal, quote.currency)}</span>
              </div>
              {quote.freightAmount ? (
                <div className="flex w-56 justify-between">
                  <span className="text-ink-soft">Frete</span>
                  <span className="tabular-nums">{formatMoney(quote.freightAmount, quote.currency)}</span>
                </div>
              ) : null}
              <div className="flex w-56 justify-between border-t border-line pt-1 font-medium">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(quote.total, quote.currency)}</span>
              </div>
            </div>
          </Card>

          {editable ? (
            <Card>
              <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Adicionar item</h2>
              <AddItemForm quoteId={quote.id} materials={materials} />
            </Card>
          ) : null}
        </div>

        <Card>
          <div className="grid">
            <DataRow label="Cliente" value={quote.customer?.name} />
            <DataRow label="Projeto" value={quote.project?.name} />
            <DataRow
              label="Lead"
              value={quote.lead ? <Link className="text-accent" href={`/leads/${quote.lead.id}`}>ver lead</Link> : null}
            />
            <DataRow label="Moeda" value={quote.currency} />
            <DataRow label="Incoterm" value={quote.incoterm ? INCOTERM_LABEL[quote.incoterm] ?? quote.incoterm : null} />
            <DataRow label="Porto origem" value={quote.portOfLoading} />
            <DataRow label="Porto destino" value={quote.portOfDestination} />
            <DataRow label="Pagamento" value={quote.paymentTerms} />
            <DataRow label="Validade" value={quote.validUntil ? formatDate(quote.validUntil) : null} />
            <DataRow label="Vendedor" value={quote.owner?.name} />
            <DataRow label="Criada" value={formatDate(quote.createdAt)} />
          </div>
          {quote.notes ? <p className="mt-3 text-sm text-ink-soft">{quote.notes}</p> : null}
        </Card>
      </div>
    </div>
  );
}
