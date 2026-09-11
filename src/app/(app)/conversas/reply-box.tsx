"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import { sendReply, type ReplyState } from "@/server/conversations/actions";

function Send() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary shrink-0" disabled={pending}>
      {pending ? "…" : "Enviar"}
    </button>
  );
}

export function ReplyBox({
  conversationId,
  channelReady,
  suggestion,
}: {
  conversationId: string;
  channelReady: boolean;
  suggestion: string | null;
}) {
  const [state, action] = useActionState<ReplyState, FormData>(sendReply, {});
  const [text, setText] = useState("");
  const [showSuggestion, setShowSuggestion] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      setText("");
      formRef.current?.reset();
    }
  }, [state.ok]);

  return (
    <div className="border-t border-line">
      {suggestion && showSuggestion ? (
        <div className="border-b border-line bg-accent-soft/50 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-accent">
            <Sparkles className="h-3 w-3" /> Sugestão da IA
          </p>
          <p className="text-sm text-ink">{suggestion}</p>
          <div className="mt-1.5 flex gap-2 text-xs">
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => {
                setText(suggestion);
                setShowSuggestion(false);
              }}
            >
              Usar
            </button>
            <button
              type="button"
              className="text-ink-soft hover:underline"
              onClick={() => setShowSuggestion(false)}
            >
              Ignorar
            </button>
          </div>
        </div>
      ) : null}

      <form ref={formRef} action={action} className="p-3">
        {!channelReady ? (
          <p className="mb-2 rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-xs text-gold">
            Nenhum canal conectado. A resposta fica na fila e sai quando a
            integração da Fase 3 estiver ativa.
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            name="text"
            rows={2}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva a resposta…"
            className="input resize-none"
          />
          <input type="hidden" name="conversationId" value={conversationId} />
          <Send />
        </div>
        {state.error ? <p className="mt-1 text-xs text-iron">{state.error}</p> : null}
      </form>
    </div>
  );
}
