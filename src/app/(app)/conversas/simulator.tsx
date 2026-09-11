"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { simulateInbound } from "@/server/conversations/actions";
import { SIM_TIPS, type SimulateState } from "@/server/conversations/sim-data";
import { Field } from "@/components/ui";

function Run() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Processando…" : "Simular mensagem recebida"}
    </button>
  );
}

export function Simulator() {
  const [state, action] = useActionState<SimulateState, FormData>(simulateInbound, {});
  const [text, setText] = useState(SIM_TIPS[0]);

  return (
    <div className="card p-5">
      <h2 className="font-[family-name:var(--font-display)] text-base font-medium">
        Simulador de entrada
      </h2>
      <p className="mt-1 text-xs text-ink-soft">
        Injeta uma mensagem como se tivesse chegado pelo canal, passando pelo mesmo
        pipeline (contato → dedupe → intenção → idioma → lead → funil). Só para teste,
        até a Fase 3. Não envia nada para lugar nenhum.
      </p>

      <form action={action} className="mt-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Canal">
            <select name="channel" className="input" defaultValue="WHATSAPP">
              <option value="WHATSAPP">WhatsApp</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="FACEBOOK">Facebook</option>
            </select>
          </Field>
          <Field label="Nome do contato">
            <input name="contactName" className="input" defaultValue="John Smith" required />
          </Field>
        </div>
        <Field label="ID no canal (telefone / user id)">
          <input name="externalContactId" className="input" defaultValue="+13055551234" required />
        </Field>
        <Field label="Mensagem">
          <textarea
            name="text"
            rows={2}
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {SIM_TIPS.map((tip) => (
            <button
              key={tip}
              type="button"
              onClick={() => setText(tip)}
              className="rounded-full border border-line px-2 py-1 text-[11px] text-ink-soft hover:bg-surface-2"
            >
              {tip.length > 42 ? `${tip.slice(0, 42)}…` : tip}
            </button>
          ))}
        </div>

        {state.result ? (
          <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
            {state.result}
          </p>
        ) : null}
        {state.error ? (
          <p className="rounded-md border border-iron/40 bg-iron/10 px-3 py-2 text-sm text-iron">
            {state.error}
          </p>
        ) : null}

        <Run />
      </form>
    </div>
  );
}
