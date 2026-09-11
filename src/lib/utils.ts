import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatMoney(value: number, currency: "BRL" | "USD" | "EUR" = "USD") {
  if (currency === "BRL") return BRL.format(value);
  if (currency === "EUR") return EUR.format(value);
  return USD.format(value);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}

export function relativeTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `há ${days} d`;
  return formatDate(d);
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
