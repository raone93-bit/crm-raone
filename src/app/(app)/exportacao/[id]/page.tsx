import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  SHIPMENT_FLOW,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_DOC_LABEL,
  SHIPMENT_DOC_STATUS_LABEL,
  INCOTERM_LABEL,
} from "@/lib/labels";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader, Card, DataRow, Badge } from "@/components/ui";
import {
  StatusStepper,
  ShipmentDetailsForm,
  AddContainerForm,
  DocStatusSelect,
} from "./shipment-forms";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const s = await prisma.shipment.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { order: { select: { number: true } } },
  });
  return { title: s ? `Embarque ${s.order.number}` : "Embarque" };
}

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const editable = can(user.role, "edit", "shipment");

  const shipment = await prisma.shipment.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      order: { include: { customer: { include: { company: true, contact: true } }, items: true } },
      containers: { orderBy: { createdAt: "asc" } },
      documents: true,
    },
  });
  if (!shipment) notFound();

  const idx = SHIPMENT_FLOW.indexOf(shipment.status as (typeof SHIPMENT_FLOW)[number]);

  return (
    <div>
      <PageHeader
        title={`Embarque · Pedido ${shipment.order.number}`}
        description={
          shipment.order.customer?.company?.name ??
          shipment.order.customer?.contact?.displayName ??
          "Exportação"
        }
        action={
          <Link href="/exportacao" className="btn-ghost">
            ← Exportação
          </Link>
        }
      />

      {/* Máquina de estados */}
      <Card className="mb-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-base font-medium">
            Status: {SHIPMENT_STATUS_LABEL[shipment.status] ?? shipment.status}
          </h2>
          {editable ? <StatusStepper shipmentId={shipment.id} status={shipment.status} /> : null}
        </div>
        <ol className="flex flex-wrap gap-1.5 text-[11px]">
          {SHIPMENT_FLOW.map((s, i) => (
            <li
              key={s}
              className={`rounded-full border px-2 py-0.5 ${
                i < idx
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : i === idx
                    ? "border-accent bg-accent text-white"
                    : "border-line text-ink-soft"
              }`}
            >
              {SHIPMENT_STATUS_LABEL[s] ?? s}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Dados do embarque</h2>
            {editable ? (
              <ShipmentDetailsForm shipment={shipment as never} />
            ) : (
              <div className="grid gap-x-8 sm:grid-cols-2">
                <DataRow label="Booking" value={shipment.bookingNumber} />
                <DataRow label="Armador" value={shipment.carrier} />
                <DataRow label="Navio" value={shipment.vessel} />
                <DataRow label="BL" value={shipment.blNumber} />
                <DataRow label="ETD" value={shipment.etd ? formatDate(shipment.etd) : null} />
                <DataRow label="ETA" value={shipment.eta ? formatDate(shipment.eta) : null} />
                <DataRow label="Consignee" value={shipment.consignee} />
                <DataRow label="Notify" value={shipment.notifyParty} />
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-base font-medium">
                Containers ({shipment.containers.length})
              </h2>
            </div>
            {shipment.containers.length > 0 ? (
              <ul className="mb-4 flex flex-col gap-1.5 text-sm">
                {shipment.containers.map((c) => (
                  <li key={c.id} className="flex justify-between border-b border-line py-2 last:border-0">
                    <span className="font-medium">{c.containerNumber}</span>
                    <span className="text-ink-soft">
                      {c.type ?? ""} {c.seal ? `· lacre ${c.seal}` : ""}{" "}
                      {c.cargoWeightKg ? `· ${c.cargoWeightKg} kg` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-ink-soft">Nenhum container.</p>
            )}
            {editable ? <AddContainerForm shipmentId={shipment.id} /> : null}
          </Card>

          <Card>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-medium">Documentos</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {shipment.documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                  <span>{SHIPMENT_DOC_LABEL[doc.type] ?? doc.type}</span>
                  {editable ? (
                    <DocStatusSelect documentId={doc.id} status={doc.status} />
                  ) : (
                    <Badge tone={doc.status === "sent" || doc.status === "ready" ? "accent" : "gold"}>
                      {SHIPMENT_DOC_STATUS_LABEL[doc.status] ?? doc.status}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card>
          <div className="grid">
            <DataRow
              label="Pedido"
              value={
                <Link className="text-accent" href={`/pedidos/${shipment.orderId}`}>
                  {shipment.order.number}
                </Link>
              }
            />
            <DataRow label="Valor" value={formatMoney(shipment.order.total, shipment.order.currency)} />
            <DataRow
              label="Incoterm"
              value={shipment.incoterm ? INCOTERM_LABEL[shipment.incoterm] ?? shipment.incoterm : null}
            />
            <DataRow label="Origem" value={shipment.portOfLoading} />
            <DataRow label="Destino" value={shipment.portOfDestination} />
            <DataRow label="ISF" value={shipment.isfStatus} />
            <DataRow label="Forwarder" value={shipment.forwarder} />
            <DataRow label="Despachante" value={shipment.customsBroker} />
            <DataRow label="Aberto em" value={formatDate(shipment.createdAt)} />
          </div>
          {shipment.notes ? <p className="mt-3 text-sm text-ink-soft">{shipment.notes}</p> : null}
        </Card>
      </div>
    </div>
  );
}
