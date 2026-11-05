"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveSdrSettings, type SdrSettingsState } from "@/server/sdr/actions";
import { Field } from "@/components/ui";

const CHANNELS = [
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "INSTAGRAM", label: "Instagram Direct" },
  { id: "FACEBOOK", label: "Messenger" },
] as const;

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Salvando…" : "Salvar configuração"}
    </button>
  );
}

export function SdrSettingsForm({
  current,
  users,
}: {
  current: {
    enabled: boolean;
    channels: string[];
    agentName: string;
    companyName: string;
    knowledgeBase: string;
    qualificationCriteria: string;
    handoffUserId: string | null;
    maxRepliesPerDay: number;
    model: string | null;
  };
  users: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<SdrSettingsState, FormData>(saveSdrSettings, {});

  return (
    <form action={action} className="grid gap-5">
      <label className="flex items-start gap-3 rounded-md border border-line bg-ground p-3">
        <input type="checkbox" name="enabled" defaultChecked={current.enabled} className="mt-1 h-4 w-4" />
        <span>
          <span className="block font-medium">Responder sozinho</span>
          <span className="text-xs text-ink-soft">
            Ligado: o agente responde as mensagens novas nos canais marcados, qualifica e passa para um vendedor.
            Quando um vendedor responde pelo CRM, o agente sai daquela conversa.
          </span>
        </span>
      </label>

      <Field label="Canais">
        <div className="flex flex-wrap gap-4 text-sm">
          {CHANNELS.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" name={`channel_${c.id}`} defaultChecked={current.channels.includes(c.id)} />
              {c.label}
            </label>
          ))}
        </div>
        <span className="text-[11px] text-ink-soft">E-mail fica fora do piloto automático.</span>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do agente (assina as mensagens)">
          <input name="agentName" defaultValue={current.agentName} className="input" required />
        </Field>
        <Field label="Empresa">
          <input name="companyName" defaultValue={current.companyName} className="input" required />
        </Field>
        <Field label="Vendedor que recebe os leads e as ligações">
          <select name="handoffUserId" defaultValue={current.handoffUserId ?? ""} className="input">
            <option value="">Dono do lead / vendedor da conversa</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Máx. respostas automáticas por conversa em 24 h">
          <input name="maxRepliesPerDay" type="number" min={1} max={100} defaultValue={current.maxRepliesPerDay} className="input" />
        </Field>
      </div>

      <Field label="Critérios de lead qualificado">
        <textarea
          name="qualificationCriteria"
          defaultValue={current.qualificationCriteria}
          rows={5}
          className="input h-auto py-2 font-mono text-xs"
        />
      </Field>

      <Field label="Base de conhecimento (o agente só afirma o que estiver aqui ou no estoque)">
        <textarea
          name="knowledgeBase"
          defaultValue={current.knowledgeBase}
          rows={16}
          className="input h-auto py-2 font-mono text-xs"
        />
        <span className="text-[11px] text-ink-soft">
          Não coloque preço aqui: o agente nunca informa preço, prazo ou condição de pagamento — isso vai para o vendedor.
        </span>
      </Field>

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-soft">Avançado</summary>
        <div className="mt-3">
          <Field label="Modelo do Claude (vazio = padrão)">
            <input name="model" defaultValue={current.model ?? ""} placeholder="claude-sonnet-4-5" className="input font-mono text-xs" />
          </Field>
        </div>
      </details>

      {state.error ? <p className="text-sm text-iron">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-accent">{state.ok}</p> : null}

      <div>
        <Save />
      </div>
    </form>
  );
}
