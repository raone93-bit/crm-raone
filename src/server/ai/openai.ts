import type { LLMProvider } from "./provider";
import { normalizeProviderOutput } from "./provider";
import type { AnalyzeInput, ProviderAnalysis } from "./schema";
import { ANALYSIS_SYSTEM_PROMPT, buildUserContent } from "./prompts";

/**
 * Provedor alternativo: OpenAI (via HTTP, sem SDK).
 * Existe para provar que o provedor é trocável (item 43). O padrão é Claude.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "OPENAI" as const;
  readonly model: string;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.model = process.env.AI_MODEL || "gpt-4o-mini";
  }

  async analyzeConversation(input: AnalyzeInput): Promise<ProviderAnalysis> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              ANALYSIS_SYSTEM_PROMPT +
              "\n\nResponda APENAS com um objeto JSON com as chaves: language, language_confidence, has_commercial_intent, intent_type, extracted, score, score_factors, summary, suggested_reply, confidence.",
          },
          { role: "user", content: buildUserContent(input) },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI respondeu ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI: resposta vazia.");

    const parsed = JSON.parse(content);
    const inTok = json?.usage?.prompt_tokens ?? null;
    const outTok = json?.usage?.completion_tokens ?? null;

    return normalizeProviderOutput(parsed, { inputTokens: inTok, outputTokens: outTok, costUsd: null });
  }
}
