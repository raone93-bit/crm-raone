"use client";

import { markConversationRead, setConversationStatus, assignConversation } from "@/server/conversations/actions";

export function ThreadActions({
  conversationId,
  status,
  unread,
  canAssign,
  sellers,
  currentSellerId,
}: {
  conversationId: string;
  status: string;
  unread: number;
  canAssign: boolean;
  sellers: { id: string; displayName: string }[];
  currentSellerId: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {unread > 0 ? (
        <form action={markConversationRead}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <button type="submit" className="btn-ghost text-xs">
            Marcar lida
          </button>
        </form>
      ) : null}

      <form action={setConversationStatus}>
        <input type="hidden" name="conversationId" value={conversationId} />
        <select
          name="status"
          defaultValue={status}
          className="input h-8 w-auto py-0 text-xs"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="OPEN">Aberta</option>
          <option value="PENDING">Pendente</option>
          <option value="SNOOZED">Adiada</option>
          <option value="CLOSED">Fechada</option>
        </select>
      </form>

      {canAssign ? (
        <form action={assignConversation}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <select
            name="sellerId"
            defaultValue={currentSellerId ?? ""}
            className="input h-8 w-auto py-0 text-xs"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="" disabled>
              Atribuir…
            </option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </form>
      ) : null}
    </div>
  );
}
