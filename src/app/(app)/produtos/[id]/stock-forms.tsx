"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createBundle, createBlock, setBundleStatus, type CatalogState } from "@/server/catalog/actions";
import { FINISH_LABEL, QUALITY_LABEL, STOCK_STATUS_LABEL } from "@/lib/labels";
import { Field } from "@/components/ui";

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending}>
      {pending ? "…" : label}
    </button>
  );
}

export function AddBundleForm({ materialId }: { materialId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CatalogState, FormData>(createBundle, {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-xs">
        + Bundle
      </button>
    );
  }
  return (
    <form action={action} className="mt-3 grid gap-3 rounded-md border border-line bg-ground p-3 sm:grid-cols-2">
      <input type="hidden" name="materialId" value={materialId} />
      <Field label="Número do bundle *">
        <input name="bundleNumber" required className="input" />
      </Field>
      <Field label="Chapas">
        <input name="slabCount" type="number" className="input" />
      </Field>
      <Field label="m²">
        <input name="squareMeters" type="number" step="0.01" className="input" />
      </Field>
      <Field label="Espessura (cm)">
        <input name="thicknessCm" type="number" step="0.1" className="input" />
      </Field>
      <Field label="Acabamento">
        <select name="finish" className="input" defaultValue="">
          <option value="">—</option>
          {Object.entries(FINISH_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Qualidade">
        <select name="quality" className="input" defaultValue="">
          <option value="">—</option>
          {Object.entries(QUALITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Localização">
        <input name="location" className="input" placeholder="Galpão 2" />
      </Field>
      <Field label="Status">
        <select name="status" className="input" defaultValue="AVAILABLE">
          {Object.entries(STOCK_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      {state.error ? <p className="text-xs text-iron sm:col-span-2">{state.error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <Save label="Salvar bundle" />
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function AddBlockForm({ materialId }: { materialId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CatalogState, FormData>(createBlock, {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-xs">
        + Bloco
      </button>
    );
  }
  return (
    <form action={action} className="mt-3 grid gap-3 rounded-md border border-line bg-ground p-3 sm:grid-cols-2">
      <input type="hidden" name="materialId" value={materialId} />
      <Field label="Número do bloco *">
        <input name="blockNumber" required className="input" />
      </Field>
      <Field label="Pedreira">
        <input name="quarry" className="input" />
      </Field>
      <Field label="Comprimento (cm)">
        <input name="lengthCm" type="number" step="0.1" className="input" />
      </Field>
      <Field label="Largura (cm)">
        <input name="widthCm" type="number" step="0.1" className="input" />
      </Field>
      <Field label="Altura (cm)">
        <input name="heightCm" type="number" step="0.1" className="input" />
      </Field>
      <Field label="Peso (kg)">
        <input name="weightKg" type="number" step="1" className="input" />
      </Field>
      {state.error ? <p className="text-xs text-iron sm:col-span-2">{state.error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <Save label="Salvar bloco" />
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function BundleStatusSelect({ bundleId, status }: { bundleId: string; status: string }) {
  return (
    <form action={setBundleStatus}>
      <input type="hidden" name="bundleId" value={bundleId} />
      <select
        name="status"
        defaultValue={status}
        className="input h-7 w-auto py-0 text-xs"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {Object.entries(STOCK_STATUS_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </form>
  );
}
