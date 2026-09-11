"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  updateShipment,
  setShipmentStatus,
  addContainer,
  setDocumentStatus,
  type ShipmentState,
} from "@/server/shipments/actions";
import {
  SHIPMENT_FLOW,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_DOC_STATUS_LABEL,
} from "@/lib/labels";
import { Field } from "@/components/ui";

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending}>
      {pending ? "…" : label}
    </button>
  );
}

export function StatusStepper({
  shipmentId,
  status,
}: {
  shipmentId: string;
  status: string;
}) {
  const idx = SHIPMENT_FLOW.indexOf(status as (typeof SHIPMENT_FLOW)[number]);
  const next = idx >= 0 && idx < SHIPMENT_FLOW.length - 1 ? SHIPMENT_FLOW[idx + 1] : null;
  const prev = idx > 0 ? SHIPMENT_FLOW[idx - 1] : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={setShipmentStatus}>
        <input type="hidden" name="shipmentId" value={shipmentId} />
        <select
          name="status"
          defaultValue={status}
          className="input h-8 w-auto py-0 text-xs"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {SHIPMENT_FLOW.map((s) => (
            <option key={s} value={s}>
              {SHIPMENT_STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </select>
      </form>
      {prev ? (
        <form action={setShipmentStatus}>
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <input type="hidden" name="status" value={prev} />
          <button type="submit" className="btn-ghost text-xs">
            ← voltar
          </button>
        </form>
      ) : null}
      {next ? (
        <form action={setShipmentStatus}>
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <input type="hidden" name="status" value={next} />
          <button type="submit" className="btn-primary text-xs">
            Avançar → {SHIPMENT_STATUS_LABEL[next] ?? next}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function ShipmentDetailsForm({
  shipment,
}: {
  shipment: Record<string, unknown> & { id: string };
}) {
  const [state, action] = useActionState<ShipmentState, FormData>(updateShipment, {});
  const v = (k: string) => (shipment[k] as string | null) ?? "";
  const d = (k: string) => {
    const val = shipment[k] as Date | string | null;
    if (!val) return "";
    const dt = typeof val === "string" ? new Date(val) : val;
    return dt.toISOString().slice(0, 10);
  };

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="shipmentId" value={shipment.id} />
      <Field label="Booking">
        <input name="bookingNumber" defaultValue={v("bookingNumber")} className="input" />
      </Field>
      <Field label="Armador / carrier">
        <input name="carrier" defaultValue={v("carrier")} className="input" />
      </Field>
      <Field label="Navio">
        <input name="vessel" defaultValue={v("vessel")} className="input" />
      </Field>
      <Field label="Depot (retirada do vazio)">
        <input name="depot" defaultValue={v("depot")} className="input" />
      </Field>
      <Field label="Porto de origem">
        <input name="portOfLoading" defaultValue={v("portOfLoading")} className="input" />
      </Field>
      <Field label="Porto de destino">
        <input name="portOfDestination" defaultValue={v("portOfDestination")} className="input" />
      </Field>
      <Field label="Retirada do vazio">
        <input name="emptyPickupAt" type="date" defaultValue={d("emptyPickupAt")} className="input" />
      </Field>
      <Field label="Carregamento">
        <input name="loadedAt" type="date" defaultValue={d("loadedAt")} className="input" />
      </Field>
      <Field label="Gate in (entrega no porto)">
        <input name="gateInAt" type="date" defaultValue={d("gateInAt")} className="input" />
      </Field>
      <Field label="ETD">
        <input name="etd" type="date" defaultValue={d("etd")} className="input" />
      </Field>
      <Field label="ETA">
        <input name="eta" type="date" defaultValue={d("eta")} className="input" />
      </Field>
      <Field label="BL nº">
        <input name="blNumber" defaultValue={v("blNumber")} className="input" />
      </Field>
      <Field label="Tipo de BL">
        <select name="blType" defaultValue={v("blType")} className="input">
          <option value="">—</option>
          <option value="EXPRESS_RELEASE">Express Release</option>
          <option value="ORIGINAL">Original</option>
          <option value="SEAWAY">Seaway</option>
        </select>
      </Field>
      <Field label="ISF">
        <input name="isfStatus" defaultValue={v("isfStatus")} className="input" placeholder="filed / pending" />
      </Field>
      <Field label="Consignee">
        <input name="consignee" defaultValue={v("consignee")} className="input" />
      </Field>
      <Field label="Notify Party">
        <input name="notifyParty" defaultValue={v("notifyParty")} className="input" />
      </Field>
      <Field label="Freight Forwarder">
        <input name="forwarder" defaultValue={v("forwarder")} className="input" />
      </Field>
      <Field label="Despachante">
        <input name="customsBroker" defaultValue={v("customsBroker")} className="input" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Observações">
          <textarea name="notes" rows={2} defaultValue={v("notes")} className="input" />
        </Field>
      </div>
      {state.error ? <p className="text-xs text-iron sm:col-span-2">{state.error}</p> : null}
      <div className="sm:col-span-2">
        <Save label="Salvar dados do embarque" />
      </div>
    </form>
  );
}

export function AddContainerForm({ shipmentId }: { shipmentId: string }) {
  const [state, action] = useActionState<ShipmentState, FormData>(addContainer, {});
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <Field label="Container nº *">
        <input name="containerNumber" required className="input" placeholder="MSKU1234567" />
      </Field>
      <Field label="Lacre">
        <input name="seal" className="input" />
      </Field>
      <Field label="Tipo">
        <select name="type" className="input" defaultValue="40HC">
          <option value="20DV">20' DV</option>
          <option value="40DV">40' DV</option>
          <option value="40HC">40' HC</option>
        </select>
      </Field>
      <Field label="Peso carga (kg)">
        <input name="cargoWeightKg" type="number" className="input" />
      </Field>
      {state.error ? <p className="text-xs text-iron sm:col-span-4">{state.error}</p> : null}
      <div className="sm:col-span-4">
        <Save label="Adicionar container" />
      </div>
    </form>
  );
}

export function DocStatusSelect({ documentId, status }: { documentId: string; status: string }) {
  return (
    <form action={setDocumentStatus}>
      <input type="hidden" name="documentId" value={documentId} />
      <select
        name="status"
        defaultValue={status}
        className="input h-7 w-auto py-0 text-xs"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {Object.entries(SHIPMENT_DOC_STATUS_LABEL).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}
