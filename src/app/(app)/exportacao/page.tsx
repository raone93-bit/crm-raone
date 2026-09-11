import Link from "next/link";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SHIPMENT_STATUS_LABEL, SHIPMENT_FLOW } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { PageHeader, EmptyState, Badge } from "@/components/ui";

export const metadata = { title: "Exportação" };

export default async function ExportacaoPage() {
  const user = await requireUser();
  const shipments = await prisma.shipment.findMany({
    where: { organizationId: user.organizationId },
    include: {
      order: { include: { customer: { include: { company: true, contact: true } } } },
      _count: { select: { containers: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Exportação e logística"
        description="Acompanhamento da carga do booking à chegada no destino."
      />

      {shipments.length === 0 ? (
        <EmptyState
          title="Nenhum embarque"
          description="Abra o embarque a partir de um pedido (botão na tela do pedido)."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase text-ink-soft">
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">ETD</th>
                <th className="px-4 py-3">ETA</th>
                <th className="px-4 py-3">Containers</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => {
                const idx = SHIPMENT_FLOW.indexOf(s.status as (typeof SHIPMENT_FLOW)[number]);
                const done = s.status === "COMPLETED";
                return (
                  <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link href={`/exportacao/${s.id}`} className="font-medium hover:text-accent">
                        {s.order.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {s.order.customer?.company?.name ?? s.order.customer?.contact?.displayName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{s.portOfDestination ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.etd ? formatDate(s.etd) : "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.eta ? formatDate(s.eta) : "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{s._count.containers}</td>
                    <td className="px-4 py-3">
                      <Badge tone={done ? "accent" : "gold"}>
                        {idx + 1}/{SHIPMENT_FLOW.length} · {SHIPMENT_STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
