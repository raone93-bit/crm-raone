"use client";

import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignora */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap rounded border border-line bg-ground px-2 py-1.5 text-xs">
        {value}
      </code>
      <button type="button" onClick={copy} className="btn-ghost shrink-0 text-xs">
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
