"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createLead, type CreateLeadState } from "@/server/leads/actions";
import { Field } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Criando…" : "Criar lead"}
    </button>
  );
}

export function NewLeadForm({
  sellers,
  canPickSeller,
}: {
  sellers: { id: string; displayName: string }[];
  canPickSeller: boolean;
}) {
  const [state, action] = useActionState<CreateLeadState, FormData>(createLead, {});

  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do contato *">
          <input name="contactName" required className="input" placeholder="John Smith" />
        </Field>
        <Field label="Canal *">
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
      </div>

      <Field label="Assunto">
        <input name="title" className="input" placeholder="Taj Mahal 3 cm — projeto Miami" />
      </Field>

      <Field label="Primeira mensagem do cliente">
        <textarea
          name="firstMessage"
          rows={3}
          className="input"
          placeholder="Hi, I'm looking for 100 sqm of Taj Mahal quartzite, 3 cm polished, for a project in Miami."
        />
        <span className="text-xs text-ink-soft">
          Usada para detectar o idioma quando o roteamento for automático.
        </span>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Idioma">
          <select name="language" className="input" defaultValue="AUTO">
            <option value="AUTO">Detectar</option>
            <option value="PT">Português → Rodolfo</option>
            <option value="ES">Espanhol → Gabriel</option>
            <option value="EN">Inglês → Gabriel</option>
            <option value="OTHER">Outro → Triagem</option>
          </select>
        </Field>
        <Field label="País">
          <input name="country" className="input" placeholder="US" />
        </Field>
        <Field label="Cidade">
          <input name="city" className="input" placeholder="Miami" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Material (texto livre)">
          <input name="materialText" className="input" placeholder="Taj Mahal" />
        </Field>
        <Field label="Metragem (m²)">
          <input name="squareMeters" type="number" step="0.01" className="input" placeholder="120" />
        </Field>
      </div>

      {canPickSeller ? (
        <Field label="Vendedor (opcional — sobrepõe o roteamento por idioma)">
          <select name="sellerId" className="input" defaultValue="">
            <option value="">Automático pelo idioma</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {state.error ? (
        <p className="rounded-md border border-iron/40 bg-iron/10 px-3 py-2 text-sm text-iron">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Submit />
        <Link href="/leads" className="btn-ghost">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
