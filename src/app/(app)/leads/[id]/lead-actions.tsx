"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  moveLeadStage,
  markLeadLost,
  scheduleFollowUp,
  assignLead,
  type LostState,
  type FollowUpState,
} from "@/server/leads/actions";
import { convertLeadToCustomer } from "@/server/customers/actions";
import { LOST_REASON_LABEL } from "@/lib/labels";
import { Field } from "@/components/ui";

function SubmitButton({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={variant === "primary" ? "btn-primary" : "btn-ghost"} disabled={pending}>
      {pending ? "…" : children}
    </button>
  );
}

export function StageControl({
  leadId,
  stages,
  currentStageId,
}: {
  leadId: string;
  stages: { id: string; name: string; isLost: boolean }[];
  currentStageId: string;
}) {
  return (
    <form action={moveLeadStage} className="flex flex-col gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <Field label="Mover para etapa">
        <select name="toStageId" defaultValue={currentStageId} className="input">
          {stages
            .filter((s) => !s.isLost)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </Field>
      <SubmitButton>Salvar etapa</SubmitButton>
    </form>
  );
}

export function LostControl({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<LostState, FormData>(markLeadLost, {});

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost w-full text-iron">
        Marcar como perdido
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border border-iron/30 bg-iron/5 p-3">
      <input type="hidden" name="leadId" value={leadId} />
      <Field label="Motivo da perda *">
        <select name="reason" required className="input" defaultValue="">
          <option value="" disabled>
            Selecione…
          </option>
          {Object.entries(LOST_REASON_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Observação">
        <textarea name="note" rows={2} className="input" />
      </Field>
      {state.error ? <p className="text-xs text-iron">{state.error}</p> : null}
      <div className="flex gap-2">
        <SubmitButton>Confirmar perda</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function FollowUpControl({ leadId }: { leadId: string }) {
  const [state, action] = useActionState<FollowUpState, FormData>(scheduleFollowUp, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <Field label="Próximo follow-up">
        <input name="dueAt" type="datetime-local" required className="input" />
      </Field>
      <Field label="O quê">
        <input name="reason" className="input" placeholder="Enviar cotação / ligar / confirmar estoque" />
      </Field>
      {state.ok ? <p className="text-xs text-accent">Agendado.</p> : null}
      {state.error ? <p className="text-xs text-iron">{state.error}</p> : null}
      <SubmitButton variant="ghost">Agendar follow-up</SubmitButton>
    </form>
  );
}

export function AssignControl({
  leadId,
  sellers,
  currentSellerId,
}: {
  leadId: string;
  sellers: { id: string; displayName: string }[];
  currentSellerId: string | null;
}) {
  return (
    <form action={assignLead} className="flex flex-col gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <Field label="Vendedor">
        <select name="sellerId" defaultValue={currentSellerId ?? ""} className="input">
          <option value="" disabled>
            Selecione…
          </option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton variant="ghost">Reatribuir</SubmitButton>
    </form>
  );
}

export function ConvertControl({ leadId, alreadyCustomer }: { leadId: string; alreadyCustomer: boolean }) {
  if (alreadyCustomer) {
    return <p className="text-xs text-ink-soft">Este contato já é cliente.</p>;
  }
  return (
    <form action={convertLeadToCustomer}>
      <input type="hidden" name="leadId" value={leadId} />
      <SubmitButton variant="ghost">Converter em cliente</SubmitButton>
    </form>
  );
}
