import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production AI transport", () => {
  const source = () => readFileSync(resolve(process.cwd(), "lib/ai/model.ts"), "utf8");

  it("keeps the Vercel AI Gateway boundary as the no-key path", () => {
    const text = source();
    expect(text).toContain('from "ai"');
    expect(text).toContain("generateText");
    expect(text).toContain("gateway(");
    expect(text).toContain("anthropic/claude-haiku-4.5");
  });

  it("reads the direct Anthropic key only from the server environment, never a literal", () => {
    const text = source();
    // The direct path (nc#272) exists because the gateway refuses inference
    // until the team has a card on file. The key must come from process.env
    // and no key material may ever be committed.
    expect(text).toContain("process.env.ANTHROPIC_API_KEY");
    expect(text).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    // Server-only guard: the boundary must never ship client-side.
    expect(text).not.toContain('"use client"');
  });

  it("does not treat the OIDC token alone as proof the gateway can serve", () => {
    // OIDC authenticates to the gateway, which then refuses inference without
    // billing verification — the render-then-fail demo trap. The token only
    // counts when billing has been explicitly confirmed.
    const text = source();
    const gate = text.slice(text.indexOf("export function isModelAvailable"));
    expect(gate).toContain("AI_GATEWAY_BILLING_VERIFIED");
  });
});
