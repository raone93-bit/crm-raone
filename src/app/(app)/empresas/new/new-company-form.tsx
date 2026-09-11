"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createCompany, type CreateCompanyState } from "@/server/companies/actions";
import { COMPANY_TYPE_LABEL } from "@/lib/labels";
import { Field } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Salvando…" : "Criar empresa"}
    </button>
  );
}

export function NewCompanyForm() {
  const [state, action] = useActionState<CreateCompanyState, FormData>(createCompany, {});
  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <Field label="Nome *">
        <input name="name" required className="input" placeholder="ABC Stone Imports" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <select name="type" className="input" defaultValue="">
            <option value="">—</option>
            {Object.entries(COMPANY_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Website">
          <input name="website" className="input" placeholder="https://" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="País">
          <input name="country" className="input" placeholder="US" />
        </Field>
        <Field label="Cidade">
          <input name="city" className="input" />
        </Field>
        <Field label="CNPJ / Tax ID">
          <input name="taxId" className="input" />
        </Field>
      </div>

      {state.error ? (
        <p className="rounded-md border border-iron/40 bg-iron/10 px-3 py-2 text-sm text-iron">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Submit />
        <Link href="/empresas" className="btn-ghost">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
