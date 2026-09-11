"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addQuoteItem,
  deleteQuoteItem,
  setQuoteStatus,
  duplicateQuote,
  convertQuoteToOrder,
  type QuoteState,
} from "@/server/quotes/actions";
import { FINISH_LABEL } from "@/lib/labels";
import { Field } from "@/components/ui";

function Btn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending}>
      {pending ? "…" : label}
    </button>
  );
}

export function AddItemForm({
  quoteId,
  materials,
}: {
  quoteId: string;
  materials: { id: string; commercialName: string }[];
}) {
  const [state, action] = useActionState<QuoteState, FormData>(addQuoteItem, {});
  return (
    <form action={action} className="grid gap-3 rounded-md border border-line bg-ground p-3 sm:grid-cols-3">
      <input type="hidden" name="quoteId" value={quoteId} />
      <Field label="Material">
        <select name="materialId" className="input" defaultValue="">
          <option value="">— (texto livre)</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.commercialName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Descrição *">
        <input name="description" required className="input" placeholder="Taj Mahal polido" />
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
      <Field label="Espessura (cm)">
        <input name="thicknessCm" type="number" step="0.1" className="input" />
      </Field>
      <Field label="m² *">
        <input name="squareMeters" type="number" step="0.01" required className="input" />
      </Field>
      <Field label="Preço / m² *">
        <input name="unitPrice" type="number" step="0.01" required className="input" />
      </Field>
      {state.error ? <p className="text-xs text-iron sm:col-span-3">{state.error}</p> : null}
      <div className="sm:col-span-3">
        <Btn label="Adicionar item" />
      </div>
    </form>
  );
}

export function DeleteItemButton({ itemId }: { itemId: string }) {
  return (
    <form action={deleteQuoteItem}>
      <input type="hidden" name="itemId" value={itemId} />
      <button type="submit" className="text-xs text-iron hover:underline">
        remover
      </button>
    </form>
  );
}

export function QuoteStatusBar({
  quoteId,
  status,
  hasItems,
  hasOrder,
}: {
  quoteId: string;
  status: string;
  hasItems: boolean;
  hasOrder: boolean;
}) {
  const locked = status === "CONVERTED";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!locked ? (
        <form action={setQuoteStatus}>
          <input type="hidden" name="quoteId" value={quoteId} />
          <select
            name="status"
            defaultValue={status}
            className="input h-8 w-auto py-0 text-xs"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="DRAFT">Rascunho</option>
            <option value="SENT">Enviada</option>
            <option value="APPROVED">Aprovada</option>
            <option value="REJECTED">Recusada</option>
            <option value="EXPIRED">Vencida</option>
          </select>
        </form>
      ) : null}

      <a href={`/api/cotacoes/${quoteId}/pdf`} target="_blank" rel="noopener" className="btn-ghost text-xs">
        Baixar PDF
      </a>

      <form action={duplicateQuote}>
        <input type="hidden" name="quoteId" value={quoteId} />
        <button type="submit" className="btn-ghost text-xs">
          Duplicar
        </button>
      </form>

      {!locked && !hasOrder && hasItems ? (
        <form action={convertQuoteToOrder}>
          <input type="hidden" name="quoteId" value={quoteId} />
          <button type="submit" className="btn-primary text-xs">
            Converter em pedido
          </button>
        </form>
      ) : null}
    </div>
  );
}
