"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createProject, type ProjectState } from "@/server/projects/actions";
import { Field } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Salvando…" : "Criar projeto"}
    </button>
  );
}

export function NewProjectForm({
  materials,
  companies,
}: {
  materials: { id: string; commercialName: string }[];
  companies: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<ProjectState, FormData>(createProject, {});
  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <Field label="Nome do projeto *">
        <input name="name" required className="input" placeholder="Residência Alphaville" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Empresa">
          <select name="companyId" className="input" defaultValue="">
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Material previsto">
          <select name="materialId" className="input" defaultValue="">
            <option value="">—</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.commercialName}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Cidade">
          <input name="city" className="input" />
        </Field>
        <Field label="País">
          <input name="country" className="input" />
        </Field>
        <Field label="m² estimado">
          <input name="squareMeters" type="number" step="0.01" className="input" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Arquiteto">
          <input name="architect" className="input" />
        </Field>
        <Field label="Marmoraria / fabricante">
          <input name="fabricator" className="input" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Prazo">
          <input name="deadline" type="date" className="input" />
        </Field>
        <Field label="Orçamento">
          <input name="budget" type="number" step="0.01" className="input" />
        </Field>
        <Field label="Moeda">
          <select name="budgetCurrency" className="input" defaultValue="USD">
            <option value="USD">USD</option>
            <option value="BRL">BRL</option>
            <option value="EUR">EUR</option>
          </select>
        </Field>
      </div>
      <Field label="Probabilidade de fechamento (%)">
        <input name="probability" type="number" min="0" max="100" className="input w-32" defaultValue="20" />
      </Field>

      {state.error ? (
        <p className="rounded-md border border-iron/40 bg-iron/10 px-3 py-2 text-sm text-iron">{state.error}</p>
      ) : null}
      <Submit />
    </form>
  );
}
