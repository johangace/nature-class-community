import { gateway, generateText } from "ai";

/**
 * The one language-model boundary. A direct Anthropic key takes precedence
 * when present (the AI Gateway on this Vercel team authenticates via OIDC but
 * refuses inference until a card is on file — verified 2026-08-17,
 * `customer_verification_required`); otherwise Vercel AI Gateway supplies
 * OIDC-backed authentication and provider routing. The direct path is a plain
 * fetch rather than a second SDK: this checkout's node_modules is partly
 * symlinked (nc#153) and the @ai-sdk/anthropic major that pairs with ai@6 is
 * not installable here without churn. No provider secret reaches the browser.
 */

/** Verified against the Gateway catalogue on 2026-08-15. */
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

/** Gateway ids are `vendor/model`; the direct API wants its own id form. */
const DIRECT_ANTHROPIC_IDS: Record<string, string> = {
  "anthropic/claude-haiku-4.5": "claude-haiku-4-5",
  "anthropic/claude-sonnet-4.5": "claude-sonnet-4-5",
};

// The teacher may be mid-lesson. One bounded attempt, then the authored lesson
// simply carries on without optional help.
const TIMEOUT_MS = 8_000;

/**
 * Vercel supplies a rotating OIDC token to deployments. A static Gateway key
 * remains an explicit local/self-hosted option; neither is exposed client-side.
 */
export function isModelAvailable(): boolean {
  // Only real credentials count. `process.env.VERCEL` is set on every Vercel
  // deploy whether or not the gateway can authenticate, so treating it as a
  // signal made the helpers render and then fail on every tap in exactly the
  // environment a demo runs from. The OIDC token alone is NOT sufficient
  // either: it authenticates to the gateway, which then refuses inference
  // until the team has a card on file — the same render-then-fail trap.
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.AI_GATEWAY_API_KEY ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.AI_GATEWAY_BILLING_VERIFIED === "1"),
  );
}

export interface ModelCall {
  system: string;
  user: string;
  /**
   * One photograph riding beside the text (#377). Base64 without a data-URL
   * prefix, already client-downscaled — the routes that accept one bound its
   * size before it gets here. Never logged, never stored: this field lives
   * for the length of the call and the call alone.
   */
  image?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };
  /** Small ceiling: these outputs are one compact teacher draft. */
  maxTokens?: number;
  /** Server-owned per-call selection; never copied from teacher text. */
  model?: string;
  /** An off-request preparation may need longer than an in-lesson hint. */
  timeoutMs?: number;
}

export interface ModelResult {
  text: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** One bounded call straight to the Anthropic Messages API. Fail-soft. */
async function callAnthropicDirect(
  apiKey: string,
  model: string,
  call: ModelCall,
): Promise<ModelResult | null> {
  const direct =
    DIRECT_ANTHROPIC_IDS[model] ?? model.slice("anthropic/".length).replaceAll(".", "-");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), call.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: direct,
        max_tokens: call.maxTokens ?? 400,
        system: call.system,
        messages: [
          {
            role: "user",
            content: call.image
              ? [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: call.image.mediaType,
                      data: call.image.base64,
                    },
                  },
                  { type: "text", text: call.user },
                ]
              : call.user,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      stop_reason?: string;
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    if (data.stop_reason === "refusal") return null;
    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!text) return null;
    return {
      text,
      model: direct,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Generate one fail-soft draft. No prompt or response content is logged. */
export async function callModel(call: ModelCall): Promise<ModelResult | null> {
  if (!isModelAvailable()) return null;
  if (call.model !== undefined && !/^[^/\s]+\/[^\s]+$/.test(call.model)) throw new Error("Model must name a provider and model");
  if (call.timeoutMs !== undefined && (!Number.isSafeInteger(call.timeoutMs) || call.timeoutMs <= 0 || call.timeoutMs > 2_147_483_647)) throw new Error("Model timeout must be a positive integer within the platform timer range");
  const configured = call.model ?? process.env.NATURE_CLASS_AI_MODEL?.trim();
  const model = configured?.includes("/") ? configured : DEFAULT_MODEL;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && model.startsWith("anthropic/")) {
    return callAnthropicDirect(anthropicKey, model, call);
  }

  try {
    const result = await generateText({
      model: gateway(model),
      system: call.system,
      ...(call.image
        ? {
            messages: [
              {
                role: "user" as const,
                content: [
                  {
                    type: "image" as const,
                    image: call.image.base64,
                    mediaType: call.image.mediaType,
                  },
                  { type: "text" as const, text: call.user },
                ],
              },
            ],
          }
        : { prompt: call.user }),
      maxOutputTokens: call.maxTokens ?? 400,
      maxRetries: 0,
      timeout: call.timeoutMs ?? TIMEOUT_MS,
      providerOptions: {
        gateway: {
          tags: ["product:nature-class", "feature:teacher-support"],
        },
      },
    });
    const text = result.text.trim();
    if (!text) return null;
    return {
      text,
      model,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    };
  } catch {
    return null;
  }
}
