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
  vapiReady,
  webhookUrl,
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
    voiceEnabled: boolean;
    vapiPhoneNumberId: string | null;
    voiceReactivationEnabled: boolean;
    reactivationAfterDays: number;
    maxCallsPerDay: number;
  };
  users: { id: string; name: string }[];
  vapiReady: boolean;
  webhookUrl: string;
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

      <fieldset className="grid gap-4 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium">Ligações (agente de voz · Vapi)</legend>
        {!vapiReady ? (
          <p className="text-xs text-gold">
            Falta configurar <code>VAPI_API_KEY</code> e <code>VAPI_WEBHOOK_SECRET</code> na Vercel.
          </p>
        ) : null}
        <label className="flex items-start gap-3">
          <input type="checkbox" name="voiceEnabled" defaultChecked={current.voiceEnabled} className="mt-1 h-4 w-4" />
          <span>
            <span className="block text-sm font-medium">Ligar e atender com IA</span>
            <span className="text-xs text-ink-soft">
              Atende o número da Vapi, liga no horário que o cliente marcou pelo chat e habilita o botão
              &quot;Ligar com IA&quot; nas conversas. Mesmas regras: nunca preço, prazo ou pagamento.
            </span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ID do número na Vapi (Phone Number ID)">
            <input name="vapiPhoneNumberId" defaultValue={current.vapiPhoneNumberId ?? ""} className="input font-mono text-xs" placeholder="ex.: 3f2a…" />
          </Field>
          <Field label="Máx. ligações por dia">
            <input name="maxCallsPerDay" type="number" min={1} max={200} defaultValue={current.maxCallsPerDay} className="input" />
          </Field>
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="voiceReactivationEnabled" defaultChecked={current.voiceReactivationEnabled} className="mt-1 h-4 w-4" />
          <span>
            <span className="block text-sm font-medium">Retornar leads parados por ligação</span>
            <span className="text-xs text-ink-soft">
              Só quem aceitou receber ligação e não pediu para parar. Liga em horário comercial do país do cliente, no máximo
              1 vez a cada 14 dias por lead.
            </span>
          </span>
        </label>
        <Field label="Considerar parado após (dias sem contato)">
          <input name="reactivationAfterDays" type="number" min={2} max={90} defaultValue={current.reactivationAfterDays} className="input w-32" />
        </Field>
        <p className="text-[11px] text-ink-soft">
          Para atender ligações: no painel da Vapi, no seu número, deixe o assistente vazio e use como Server URL{" "}
          <code className="break-all">{webhookUrl}</code> com uma credencial Bearer igual ao <code>VAPI_WEBHOOK_SECRET</code>.
        </p>
      </fieldset>

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
