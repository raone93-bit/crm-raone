"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { record } from "@/lib/audit";
import { SHIPMENT_FLOW } from "@/lib/labels";

const num = (v: unknown) => (v === "" || v == null ? undefined : v);
const date = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? new Date(s) : undefined;
};

const STANDARD_DOCS = [
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "BILL_OF_LADING",
  "ISF",
  "CERTIFICATE_OF_ORIGIN",
  "INSURANCE",
] as const;

export type ShipmentState = { error?: string };

export async function createShipment(formData: FormData) {
  const user = await requireUser();
  if (
    !can(user.role, "operate_logistics", "shipment") &&
    !can(user.role, "create", "shipment") &&
    !can(user.role, "edit", "shipment")
  ) {
    throw new Error("Sem permissão.");
  }

  const { orderId } = z.object({ orderId: z.string() }).parse(Object.fromEntries(formData));
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId: user.organizationId },
    include: { shipment: true, quote: true },
  });
  if (!order) throw new Error("Pedido não encontrado.");
  if (order.shipment) redirect(`/exportacao/${order.shipment.id}`);

  const shipment = await prisma.shipment.create({
    data: {
      organizationId: user.organizationId,
      orderId: order.id,
      status: "ORDER_CONFIRMED",
      incoterm: order.incoterm ?? undefined,
      portOfLoading: order.quote?.portOfLoading ?? undefined,
      portOfDestination: order.quote?.portOfDestination ?? order.destination ?? undefined,
      documents: {
        create: STANDARD_DOCS.map((type) => ({ type, status: "pending" })),
      },
    },
  });

  await record(user, {
    action: "create",
    entity: "shipment",
    entityId: shipment.id,
    verb: "created_shipment",
    summary: `Embarque aberto para o pedido ${order.number}`,
  });

  revalidatePath("/exportacao");
  revalidatePath(`/pedidos/${order.id}`);
  redirect(`/exportacao/${shipment.id}`);
}

const updateSchema = z.object({
  shipmentId: z.string(),
  bookingNumber: z.string().optional(),
  carrier: z.string().optional(),
  vessel: z.string().optional(),
  portOfLoading: z.string().optional(),
  portOfDestination: z.string().optional(),
  blNumber: z.string().optional(),
  blType: z.enum(["EXPRESS_RELEASE", "ORIGINAL", "SEAWAY"]).optional(),
  isfStatus: z.string().optional(),
  consignee: z.string().optional(),
  notifyParty: z.string().optional(),
  forwarder: z.string().optional(),
  customsBroker: z.string().optional(),
  depot: z.string().optional(),
  notes: z.string().optional(),
});

export async function updateShipment(_prev: ShipmentState, formData: FormData): Promise<ShipmentState> {
  const user = await requireUser();
  if (!can(user.role, "edit", "shipment")) return { error: "Sem permissão." };
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Dados inválidos." };
  const d = parsed.data;

  const res = await prisma.shipment.updateMany({
    where: { id: d.shipmentId, organizationId: user.organizationId },
    data: {
      bookingNumber: d.bookingNumber || null,
      carrier: d.carrier || null,
      vessel: d.vessel || null,
      portOfLoading: d.portOfLoading || null,
      portOfDestination: d.portOfDestination || null,
      blNumber: d.blNumber || null,
      blType: d.blType,
      isfStatus: d.isfStatus || null,
      consignee: d.consignee || null,
      notifyParty: d.notifyParty || null,
      forwarder: d.forwarder || null,
      customsBroker: d.customsBroker || null,
      depot: d.depot || null,
      notes: d.notes || null,
      etd: date(formData.get("etd")) ?? null,
      eta: date(formData.get("eta")) ?? null,
      emptyPickupAt: date(formData.get("emptyPickupAt")) ?? null,
      loadedAt: date(formData.get("loadedAt")) ?? null,
      gateInAt: date(formData.get("gateInAt")) ?? null,
    },
  });
  if (res.count === 0) return { error: "Embarque não encontrado." };

  revalidatePath(`/exportacao/${d.shipmentId}`);
  return {};
}

export async function setShipmentStatus(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "edit", "shipment")) throw new Error("Sem permissão.");
  const { shipmentId, status } = z
    .object({ shipmentId: z.string(), status: z.enum(SHIPMENT_FLOW) })
    .parse(Object.fromEntries(formData));

  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, organizationId: user.organizationId },
    include: { order: true },
  });
  if (!shipment) throw new Error("Embarque não encontrado.");

  await prisma.shipment.update({ where: { id: shipment.id }, data: { status } });

  // Sincroniza o status do pedido nos marcos principais.
  const orderStatus =
    status === "COMPLETED" || status === "ARRIVED"
      ? "DELIVERED"
      : status === "IN_TRANSIT" || status === "CONTAINER_GATED_IN"
        ? "SHIPPED"
        : status === "CONTAINER_LOADED"
          ? "READY"
          : null;
  if (orderStatus && shipment.order.status !== orderStatus) {
    await prisma.order.update({ where: { id: shipment.orderId }, data: { status: orderStatus } });
  }

  await record(user, {
    action: "status",
    entity: "shipment",
    entityId: shipment.id,
    verb: "shipment_status",
    summary: `Embarque ${shipment.order.number}: ${status}`,
  });
  revalidatePath(`/exportacao/${shipment.id}`);
  revalidatePath("/exportacao");
}

const containerSchema = z.object({
  shipmentId: z.string(),
  containerNumber: z.string().min(1, "Informe o número."),
  seal: z.string().optional(),
  type: z.string().optional(),
  cargoWeightKg: z.coerce.number().optional(),
});

export async function addContainer(_prev: ShipmentState, formData: FormData): Promise<ShipmentState> {
  const user = await requireUser();
  if (!can(user.role, "edit", "shipment")) return { error: "Sem permissão." };
  const parsed = containerSchema.safeParse({
    ...Object.fromEntries(formData),
    cargoWeightKg: num(formData.get("cargoWeightKg")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const shipment = await prisma.shipment.findFirst({
    where: { id: d.shipmentId, organizationId: user.organizationId },
  });
  if (!shipment) return { error: "Embarque não encontrado." };

  await prisma.container.create({
    data: {
      shipmentId: shipment.id,
      containerNumber: d.containerNumber,
      seal: d.seal || undefined,
      type: d.type || undefined,
      cargoWeightKg: d.cargoWeightKg,
    },
  });
  revalidatePath(`/exportacao/${d.shipmentId}`);
  return {};
}

export async function setDocumentStatus(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "edit", "shipment")) throw new Error("Sem permissão.");
  const { documentId, status } = z
    .object({ documentId: z.string(), status: z.enum(["pending", "in_progress", "ready", "sent", "na"]) })
    .parse(Object.fromEntries(formData));

  await prisma.shipmentDocument.updateMany({
    where: { id: documentId, shipment: { organizationId: user.organizationId } },
    data: { status },
  });

  const doc = await prisma.shipmentDocument.findUnique({ where: { id: documentId } });
  if (doc) revalidatePath(`/exportacao/${doc.shipmentId}`);
}
