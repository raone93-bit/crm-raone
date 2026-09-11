"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createMaterial, type CatalogState } from "@/server/catalog/actions";
import { MATERIAL_TYPE_LABEL } from "@/lib/labels";
import { PageHeader, Field } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Salvando…" : "Criar material"}
    </button>
  );
}

export default function NewMaterialPage() {
  const [state, action] = useActionState<CatalogState, FormData>(createMaterial, {});
  return (
    <div>
      <PageHeader title="Novo material" description="Nome comercial, tipo, origem e pedreira." />
      <form action={action} className="grid max-w-2xl gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome comercial *">
            <input name="commercialName" required className="input" placeholder="Taj Mahal" />
          </Field>
          <Field label="Nome técnico">
            <input name="technicalName" className="input" placeholder="Quartzito" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo *">
            <select name="type" className="input" defaultValue="QUARTZITE">
              {Object.entries(MATERIAL_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cor">
            <input name="color" className="input" placeholder="Bege dourado" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Origem">
            <input name="origin" className="input" placeholder="Espírito Santo" />
          </Field>
          <Field label="Pedreira">
            <input name="quarry" className="input" />
          </Field>
          <Field label="Código">
            <input name="code" className="input" />
          </Field>
        </div>
        <Field label="Observações">
          <textarea name="description" rows={2} className="input" />
        </Field>

        {state.error ? (
          <p className="rounded-md border border-iron/40 bg-iron/10 px-3 py-2 text-sm text-iron">{state.error}</p>
        ) : null}

        <div className="flex items-center gap-3">
          <Submit />
          <Link href="/produtos" className="btn-ghost">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
