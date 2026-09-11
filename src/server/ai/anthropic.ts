import Anthropic from "@anthropic-ai/sdk";

import type { LLMProvider } from "./provider";
import { normalizeProviderOutput } from "./provider";
import type { AnalyzeInput, ProviderAnalysis } from "./schema";
import { ANALYSIS_JSON_SCHEMA } from "./schema";
import { ANALYSIS_SYSTEM_PROMPT, buildUserContent } from "./prompts";

/**
 * Provedor de IA: Claude (Anthropic).
 * Usa forced tool use para saída estruturada — compatível com várias versões
 * do SDK. Modelo padrão: Haiku 4.5 (rápido e barato para classificação em
 * volume); configurável por AI_MODEL.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "ANTHROPIC" as const;
  readonly model: string;
  private client: Anthropic;
  private costIn: number;
  private costOut: number;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
    this.model = process.env.AI_MODEL || "claude-haiku-4-5";
    // US$ por 1M tokens. Padrão = Haiku 4.5. Ajuste por env se trocar de modelo.
    this.costIn = Number(process.env.AI_COST_INPUT_PER_MTOK ?? "1");
    this.costOut = Number(process.env.AI_COST_OUTPUT_PER_MTOK ?? "5");
  }

  async analyzeConversation(input: AnalyzeInput): Promise<ProviderAnalysis> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      system: ANALYSIS_SYSTEM_PROMPT,
      tool_choice: { type: "tool", name: "submit_analysis" },
      tools: [
        {
          name: "submit_analysis",
          description: "Registra a análise estruturada da conversa.",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input_schema: ANALYSIS_JSON_SCHEMA as any,
        },
      ],
      messages: [{ role: "user", content: buildUserContent(input) }],
    });

    const toolUse = res.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Claude não retornou a análise estruturada.");
    }

    const inTok = res.usage?.input_tokens ?? null;
    const outTok = res.usage?.output_tokens ?? null;
    const costUsd =
      inTok != null && outTok != null
        ? (inTok / 1e6) * this.costIn + (outTok / 1e6) * this.costOut
        : null;

    return normalizeProviderOutput(toolUse.input, {
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd,
    });
  }
}
