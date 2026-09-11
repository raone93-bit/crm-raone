"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createQuote, type QuoteState } from "@/server/quotes/actions";
import { INCOTERM_LABEL } from "@/lib/labels";
import { Field } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Criando…" : "Criar cotação"}
    </button>
  );
}

export function NewQuoteForm({
  customers,
  projects,
  leadId,
  leadLanguage,
}: {
  customers: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  leadId: string | null;
  leadLanguage: string | null;
}) {
  const [state, action] = useActionState<QuoteState, FormData>(createQuote, {});
  const isExport = leadLanguage === "EN" || leadLanguage === "ES";

  return (
    <form action={action} className="grid max-w-2xl gap-4">
      {leadId ? <input type="hidden" name="leadId" value={leadId} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente">
          <select name="customerId" className="input" defaultValue="">
            <option value="">{leadId ? "Criar a partir do lead" : "—"}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Projeto">
          <select name="projectId" className="input" defaultValue="">
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Moeda *">
          <select name="currency" className="input" defaultValue={isExport ? "USD" : "BRL"}>
            <option value="USD">USD</option>
            <option value="BRL">BRL</option>
            <option value="EUR">EUR</option>
          </select>
        </Field>
        <Field label="Incoterm">
          <select name="incoterm" className="input" defaultValue={isExport ? "FOB" : ""}>
            <option value="">—</option>
            {Object.entries(INCOTERM_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Porto de origem">
          <input name="portOfLoading" className="input" placeholder="Vitória / ES" />
        </Field>
        <Field label="Porto de destino">
          <input name="portOfDestination" className="input" placeholder="Port Everglades" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Frete">
          <input name="freightAmount" type="number" step="0.01" className="input" />
        </Field>
        <Field label="Validade">
          <input name="validUntil" type="date" className="input" />
        </Field>
        <Field label="Condição de pagamento">
          <input name="paymentTerms" className="input" placeholder="30% + saldo contra BL" />
        </Field>
      </div>

      <Field label="Observações">
        <textarea name="notes" rows={2} className="input" />
      </Field>

      {state.error ? (
        <p className="rounded-md border border-iron/40 bg-iron/10 px-3 py-2 text-sm text-iron">{state.error}</p>
      ) : null}
      <Submit />
      <p className="text-xs text-ink-soft">Os itens (material, m², preço/m²) são adicionados na próxima tela.</p>
    </form>
  );
}
