"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { record } from "@/lib/audit";

const num = (v: unknown) => (v === "" || v == null ? undefined : v);

export async function setOrderStatus(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "edit", "order")) throw new Error("Sem permissão.");
  const { orderId, status } = z
    .object({
      orderId: z.string(),
      status: z.enum(["CONFIRMED", "IN_PRODUCTION", "READY", "SHIPPED", "DELIVERED", "CANCELLED"]),
    })
    .parse(Object.fromEntries(formData));

  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId: user.organizationId } });
  if (!order) throw new Error("Pedido não encontrado.");

  await prisma.order.update({ where: { id: order.id }, data: { status } });
  await record(user, {
    action: "status",
    entity: "order",
    entityId: order.id,
    verb: "order_status",
    summary: `Pedido ${order.number}: ${status}`,
  });
  revalidatePath(`/pedidos/${order.id}`);
  revalidatePath("/pedidos");
}

export type PaymentState = { error?: string };

const paymentSchema = z.object({
  orderId: z.string(),
  amount: z.coerce.number().positive("Informe o valor."),
  method: z.enum(["WIRE", "LC", "CASH", "BOLETO", "CARD", "OTHER"]).optional(),
  dueDate: z.string().optional(),
  reference: z.string().optional(),
});

export async function addPayment(_prev: PaymentState, formData: FormData): Promise<PaymentState> {
  const user = await requireUser();
  if (!can(user.role, "edit", "order")) return { error: "Sem permissão." };
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const order = await prisma.order.findFirst({ where: { id: d.orderId, organizationId: user.organizationId } });
  if (!order) return { error: "Pedido não encontrado." };

  await prisma.payment.create({
    data: {
      organizationId: user.organizationId,
      orderId: order.id,
      amount: d.amount,
      currency: order.currency,
      method: d.method,
      dueDate: d.dueDate ? new Date(d.dueDate) : undefined,
      reference: d.reference || undefined,
      status: "PENDING",
    },
  });
  revalidatePath(`/pedidos/${order.id}`);
  return {};
}

export async function setPaymentPaid(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "edit", "order")) throw new Error("Sem permissão.");
  const { paymentId } = z.object({ paymentId: z.string() }).parse(Object.fromEntries(formData));
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, organizationId: user.organizationId },
  });
  if (!payment) throw new Error("Pagamento não encontrado.");
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "PAID", paidAt: new Date() },
  });
  revalidatePath(`/pedidos/${payment.orderId}`);
}
