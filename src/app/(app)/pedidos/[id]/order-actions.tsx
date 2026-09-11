"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  setOrderStatus,
  addPayment,
  setPaymentPaid,
  type PaymentState,
} from "@/server/orders/actions";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import { Field } from "@/components/ui";

export function OrderStatusSelect({ orderId, status }: { orderId: string; status: string }) {
  return (
    <form action={setOrderStatus}>
      <input type="hidden" name="orderId" value={orderId} />
      <select
        name="status"
        defaultValue={status}
        className="input mt-1"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </form>
  );
}

function Add() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ghost text-xs" disabled={pending}>
      {pending ? "…" : "Adicionar parcela"}
    </button>
  );
}

export function AddPaymentForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState<PaymentState, FormData>(addPayment, {});
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Valor">
        <input name="amount" type="number" step="0.01" required className="input" />
      </Field>
      <Field label="Forma">
        <select name="method" className="input" defaultValue="WIRE">
          <option value="WIRE">Wire / TT</option>
          <option value="LC">Carta de crédito</option>
          <option value="BOLETO">Boleto</option>
          <option value="CASH">À vista</option>
          <option value="CARD">Cartão</option>
          <option value="OTHER">Outro</option>
        </select>
      </Field>
      <Field label="Vencimento">
        <input name="dueDate" type="date" className="input" />
      </Field>
      <Field label="Referência">
        <input name="reference" className="input" />
      </Field>
      {state.error ? <p className="text-xs text-iron sm:col-span-4">{state.error}</p> : null}
      <div className="sm:col-span-4">
        <Add />
      </div>
    </form>
  );
}

export function MarkPaidButton({ paymentId }: { paymentId: string }) {
  return (
    <form action={setPaymentPaid}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <button type="submit" className="text-xs text-accent hover:underline">
        marcar pago
      </button>
    </form>
  );
}
