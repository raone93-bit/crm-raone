import type { LLMProvider } from "./provider";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";

let cached: LLMProvider | null | undefined;

/**
 * Devolve o provedor de IA configurado, ou null se não há chave.
 * AI_PROVIDER: "anthropic" (padrão) | "openai".
 * Sem chave → o pipeline usa só a heurística determinística.
 */
export function getProvider(): LLMProvider | null {
  if (cached !== undefined) return cached;

  const which = (process.env.AI_PROVIDER || "anthropic").toLowerCase();

  if (which === "openai") {
    const key = process.env.OPENAI_API_KEY;
    cached = key ? new OpenAIProvider(key) : null;
    return cached;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  cached = key ? new AnthropicProvider(key) : null;
  return cached;
}

export function aiEnabled(): boolean {
  return getProvider() !== null;
}

export function resetProviderCache() {
  cached = undefined;
}
