import type Anthropic from "@anthropic-ai/sdk";

/** Histórico do CRM → mensagens do Claude (cliente = user; vendedor/IA = assistant). */
export function toClaudeMessages(
  history: { direction: "INBOUND" | "OUTBOUND"; text: string | null; type: string }[],
): Anthropic.MessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of history) {
    const text = m.text?.trim() || (m.type !== "TEXT" ? `[${m.type.toLowerCase()} enviado]` : "");
    if (!text) continue;
    const role = m.direction === "INBOUND" ? "user" : "assistant";
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${text}`;
    else out.push({ role, content: text });
  }
  // A API exige começar pelo usuário.
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
