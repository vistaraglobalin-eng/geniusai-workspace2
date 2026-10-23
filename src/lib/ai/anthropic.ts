// Minimal Claude (Anthropic Messages API) client using fetch, server-only.
// Docs: https://platform.claude.com/docs/en/api/messages/create
// Swapping providers later means replacing this file; callers only use
// countInputTokens() and generate().

const API_BASE = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";
export const DEFAULT_MODEL = "claude-sonnet-5-5";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string } };

export type GenerateRequest = {
  system: string;
  content: ContentBlock[];
  maxTokens: number;
};

export type GenerateResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  truncated: boolean; // hit the output limit before finishing
  model: string;
};

export class AiProviderError extends Error {
  code: "not_configured" | "rejected_input" | "rate_limited" | "overloaded" | "provider_error" | "timeout";
  status?: number;
  constructor(code: AiProviderError["code"], message: string, status?: number) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.status = status;
  }
}

function config() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiProviderError("not_configured", "ANTHROPIC_API_KEY is not set on the server.");
  return { apiKey, model: process.env.AI_MODEL || DEFAULT_MODEL };
}

async function post(path: string, body: unknown, timeoutMs: number, fetchImpl: typeof fetch = fetch) {
  const { apiKey } = config();
  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new AiProviderError(timedOut ? "timeout" : "provider_error", timedOut ? "The AI service took too long." : "Could not reach the AI service.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      detail = data.error?.message ?? "";
    } catch {
      /* ignore */
    }
    const status = response.status;
    if (status === 400 || status === 413) throw new AiProviderError("rejected_input", detail || "The document could not be processed.", status);
    if (status === 429) throw new AiProviderError("rate_limited", "The AI service is busy. Please try again shortly.", status);
    if (status === 529 || status === 503) throw new AiProviderError("overloaded", "The AI service is overloaded. Please try again shortly.", status);
    throw new AiProviderError("provider_error", detail || `AI service error (${status}).`, status);
  }
  return response.json();
}

/** Exact input token count for a request (free; not billed by the provider). */
export async function countInputTokens(req: Omit<GenerateRequest, "maxTokens">, fetchImpl?: typeof fetch): Promise<number> {
  const { model } = config();
  const data = (await post(
    "/messages/count_tokens",
    { model, system: req.system, messages: [{ role: "user", content: req.content }] },
    30_000,
    fetchImpl
  )) as { input_tokens?: number };
  if (typeof data.input_tokens !== "number") throw new AiProviderError("provider_error", "Unexpected token count response.");
  return data.input_tokens;
}

export async function generate(req: GenerateRequest, fetchImpl?: typeof fetch): Promise<GenerateResult> {
  const { model } = config();
  const data = (await post(
    "/messages",
    {
      model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.content }]
    },
    280_000,
    fetchImpl
  )) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    stop_reason?: string;
    model?: string;
  };

  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
  const usage = data.usage ?? {};
  const inputTokens =
    (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);

  return {
    text,
    inputTokens,
    outputTokens: usage.output_tokens ?? 0,
    truncated: data.stop_reason === "max_tokens",
    model: data.model ?? model
  };
}

export function currentModel(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}
