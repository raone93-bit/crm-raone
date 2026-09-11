"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn, relativeTime } from "@/lib/utils";
import { CHANNEL_LABEL } from "@/lib/labels";

export type ConversationListItem = {
  id: string;
  contactName: string;
  channel: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  sellerName: string | null;
  status: string;
};

const CHANNEL_DOT: Record<string, string> = {
  WHATSAPP: "bg-[#25D366]",
  INSTAGRAM: "bg-[#E1306C]",
  FACEBOOK: "bg-[#1877F2]",
};

export function ConversationList({ items }: { items: ConversationListItem[] }) {
  const selected = useSearchParams().get("id");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <h1 className="font-[family-name:var(--font-display)] text-base font-medium">Conversas</h1>
        <p className="text-xs text-ink-soft">
          {items.length} · {items.filter((i) => i.unreadCount > 0).length} não lidas
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">
            Nenhuma conversa ainda. Na Fase 3 elas chegam pelos canais; use o
            simulador (admin) para testar agora.
          </p>
        ) : (
          <ul>
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/conversas?id=${c.id}`}
                  scroll={false}
                  className={cn(
                    "flex flex-col gap-1 border-b border-line px-4 py-3 transition-colors",
                    selected === c.id ? "bg-accent-soft" : "hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate font-medium">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", CHANNEL_DOT[c.channel] ?? "bg-line")} />
                      {c.contactName}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-soft">{relativeTime(c.lastMessageAt)}</span>
                  </div>
                  <p className="line-clamp-1 text-xs text-ink-soft">{c.lastMessagePreview ?? "—"}</p>
                  <div className="flex items-center justify-between text-[11px] text-ink-soft">
                    <span>
                      {CHANNEL_LABEL[c.channel] ?? c.channel}
                      {c.sellerName ? ` · ${c.sellerName}` : ""}
                    </span>
                    {c.unreadCount > 0 ? (
                      <span className="rounded-full bg-accent px-1.5 text-[10px] font-medium text-white">
                        {c.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
