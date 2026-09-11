"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createContact, type CreateContactState } from "@/server/contacts/actions";
import { Field } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Salvando…" : "Criar contato"}
    </button>
  );
}

export function NewContactForm() {
  const [state, action] = useActionState<CreateContactState, FormData>(createContact, {});

  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <Field label="Nome *">
        <input name="displayName" required className="input" placeholder="John Smith" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail">
          <input name="email" type="email" className="input" />
        </Field>
        <Field label="Telefone (E.164)">
          <input name="phone" className="input" placeholder="+13055551234" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Canal principal *">
          <select name="channel" className="input" defaultValue="WHATSAPP">
            <option value="WHATSAPP">WhatsApp</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="EMAIL">E-mail</option>
            <option value="PHONE">Telefone</option>
            <option value="MANUAL">Manual</option>
            <option value="WEBSITE">Site</option>
          </select>
        </Field>
        <Field label="ID / @ no canal">
          <input name="externalId" className="input" placeholder="@johnsmith ou +13055551234" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Idioma">
          <select name="primaryLanguage" className="input" defaultValue="">
            <option value="">—</option>
            <option value="PT">Português</option>
            <option value="ES">Espanhol</option>
            <option value="EN">Inglês</option>
            <option value="OTHER">Outro</option>
          </select>
        </Field>
        <Field label="País">
          <input name="country" className="input" placeholder="US" />
        </Field>
        <Field label="Cidade">
          <input name="city" className="input" />
        </Field>
      </div>

      <p className="text-xs text-ink-soft">
        Antes de salvar, o sistema procura um contato existente com o mesmo telefone,
        e-mail ou nome — para não duplicar pessoas (item 5).
      </p>

      {state.error ? (
        <p className="rounded-md border border-iron/40 bg-iron/10 px-3 py-2 text-sm text-iron">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Submit />
        <Link href="/clientes" className="btn-ghost">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
