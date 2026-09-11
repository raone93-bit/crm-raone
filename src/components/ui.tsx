import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("card p-5", className)}>{children}</div>;
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "accent" | "iron" | "gold";
  href?: string;
}) {
  const toneClass = {
    default: "text-ink",
    accent: "text-accent",
    iron: "text-iron",
    gold: "text-gold",
  }[tone];

  const inner = (
    <>
      <p className="label">{label}</p>
      <p className={cn("mt-2 font-[family-name:var(--font-display)] text-3xl font-medium tabular-nums", toneClass)}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card block p-4 transition-colors hover:bg-surface-2">
        {inner}
      </Link>
    );
  }
  return <div className="card p-4">{inner}</div>;
}

const TEMPERATURE_STYLE: Record<string, string> = {
  COLD: "border-line bg-surface-2 text-ink-soft",
  WARM: "border-gold/40 bg-gold/10 text-gold",
  QUALIFIED: "border-accent/40 bg-accent/10 text-accent",
  HOT: "border-iron/40 bg-iron/10 text-iron",
};
const TEMPERATURE_LABEL: Record<string, string> = {
  COLD: "Frio",
  WARM: "Morno",
  QUALIFIED: "Qualificado",
  HOT: "Quente",
};

export function TemperatureBadge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        TEMPERATURE_STYLE[value] ?? TEMPERATURE_STYLE.COLD,
      )}
    >
      {TEMPERATURE_LABEL[value] ?? value}
    </span>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "iron" | "gold";
}) {
  const toneClass = {
    default: "border-line bg-surface-2 text-ink-soft",
    accent: "border-accent/40 bg-accent/10 text-accent",
    iron: "border-iron/40 bg-iron/10 text-iron",
    gold: "border-gold/40 bg-gold/10 text-gold",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="font-[family-name:var(--font-display)] text-lg font-medium">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-ink-soft">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}
