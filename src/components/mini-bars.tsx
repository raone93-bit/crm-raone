const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  EMAIL: "E-mail",
  PHONE: "Telefone",
  MANUAL: "Manual",
  WEBSITE: "Site",
};
const LANG_LABEL: Record<string, string> = {
  PT: "Português",
  ES: "Espanhol",
  EN: "Inglês",
  OTHER: "Outros",
};

export function MiniBars({
  items,
  kind,
}: {
  items: { label: string; count: number }[];
  kind?: "channel" | "language" | "plain";
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const label = (raw: string) =>
    kind === "channel" ? CHANNEL_LABEL[raw] ?? raw : kind === "language" ? LANG_LABEL[raw] ?? raw : raw;

  if (items.length === 0) {
    return <p className="text-sm text-ink-soft">Sem dados ainda.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items
        .slice()
        .sort((a, b) => b.count - a.count)
        .map((i) => (
          <li key={i.label} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
            <span className="truncate text-ink-soft">{label(i.label)}</span>
            <span className="h-2 rounded-full bg-surface-2">
              <span
                className="block h-2 rounded-full bg-accent"
                style={{ width: `${Math.round((i.count / max) * 100)}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{i.count}</span>
          </li>
        ))}
    </ul>
  );
}

export function FunnelBars({
  stages,
}: {
  stages: { name: string; count: number; isWon: boolean; isLost: boolean }[];
}) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ul className="flex flex-col gap-1.5">
      {stages.map((s) => (
        <li key={s.name} className="grid grid-cols-[10rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate text-ink-soft">{s.name}</span>
          <span className="h-2.5 rounded-full bg-surface-2">
            <span
              className={`block h-2.5 rounded-full ${
                s.isWon ? "bg-accent" : s.isLost ? "bg-iron" : "bg-accent/60"
              }`}
              style={{ width: `${Math.round((s.count / max) * 100)}%` }}
            />
          </span>
          <span className="text-right tabular-nums">{s.count}</span>
        </li>
      ))}
    </ul>
  );
}
