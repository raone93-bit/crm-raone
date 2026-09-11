"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  saveIntegration,
  testIntegration,
  disconnectIntegration,
  type IntegrationState,
} from "@/server/integrations/actions";
import { Field } from "@/components/ui";

type Channel = "WHATSAPP" | "INSTAGRAM" | "FACEBOOK";

function Submitting({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending}>
      {pending ? "Verificando…" : children}
    </button>
  );
}

export function IntegrationForm({
  type,
  current,
}: {
  type: Channel;
  current: {
    status: string;
    wabaId: string | null;
    phoneNumberId: string | null;
    pageId: string | null;
    igAccountId: string | null;
    tokenMask: string;
  };
}) {
  const [state, action] = useActionState<IntegrationState, FormData>(saveIntegration, {});
  const [open, setOpen] = useState(current.status === "NOT_CONFIGURED" || current.status === "ERROR");

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-accent hover:underline"
        >
          {open ? "Ocultar configuração" : "Configurar"}
        </button>

        {current.status !== "NOT_CONFIGURED" ? (
          <>
            <form action={testIntegration}>
              <input type="hidden" name="type" value={type} />
              <button type="submit" className="text-xs text-ink-soft hover:text-ink hover:underline">
                Testar conexão
              </button>
            </form>
            <form action={disconnectIntegration}>
              <input type="hidden" name="type" value={type} />
              <button type="submit" className="text-xs text-iron hover:underline">
                Desconectar
              </button>
            </form>
          </>
        ) : null}
      </div>

      {open ? (
        <form action={action} className="mt-3 grid gap-3 rounded-md border border-line bg-ground p-3">
          <input type="hidden" name="type" value={type} />

          {type === "WHATSAPP" ? (
            <>
              <Field label="WhatsApp Business Account ID (WABA)">
                <input name="wabaId" defaultValue={current.wabaId ?? ""} className="input" />
              </Field>
              <Field label="Phone Number ID">
                <input name="phoneNumberId" defaultValue={current.phoneNumberId ?? ""} className="input" required />
              </Field>
            </>
          ) : null}

          {type === "FACEBOOK" ? (
            <Field label="Page ID">
              <input name="pageId" defaultValue={current.pageId ?? ""} className="input" required />
            </Field>
          ) : null}

          {type === "INSTAGRAM" ? (
            <Field label="Instagram Account ID">
              <input name="igAccountId" defaultValue={current.igAccountId ?? ""} className="input" required />
            </Field>
          ) : null}

          <Field label={`Access token${current.tokenMask !== "—" ? ` (atual: ${current.tokenMask})` : ""}`}>
            <input
              name="accessToken"
              type="password"
              placeholder={current.tokenMask !== "—" ? "deixe em branco para manter" : "token de System User"}
              className="input"
              autoComplete="off"
            />
            <span className="text-[11px] text-ink-soft">
              Guardado cifrado (AES-256-GCM) no backend. Nunca aparece aqui.
            </span>
          </Field>

          {state.error ? <p className="text-xs text-iron">{state.error}</p> : null}
          {state.ok ? <p className="text-xs text-accent">{state.ok}</p> : null}

          <div>
            <Submitting>Salvar e conectar</Submitting>
          </div>
        </form>
      ) : null}
    </div>
  );
}
