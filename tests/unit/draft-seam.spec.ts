import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callModel = vi.hoisted(() => vi.fn());
const traced = vi.hoisted(() => vi.fn(async (_t: { outcome?: string }) => {}));

vi.mock("@/lib/ai/model", () => ({
  callModel,
  isModelAvailable: () => true,
}));
vi.mock("@/lib/ai/langfuse", () => ({ trace: traced }));

const reply = (text: string) => ({ text, model: "test-model", usage: {} });

beforeEach(() => {
  callModel.mockReset();
  traced.mockReset();
  vi.resetModules();
});
afterEach(() => vi.restoreAllMocks());

async function seam() {
  return import("@/lib/ai/draft");
}

const PROMPT = { id: "p", version: 1, system: "s", user: "u" };

describe("the seam carries facts to the parser and the guard", () => {
  it("hands the call's own facts to both, which is why it exists", async () => {
    const { draft } = await seam();
    callModel.mockResolvedValue(reply('{"line":"it is 9 degrees"}'));
    const seen: unknown[] = [];
    const out = await draft({
      prompt: PROMPT,
      facts: { degrees: 9 },
      maxTokens: 10,
      parse: (json, facts) => {
        seen.push(facts);
        return (json as { line: string }).line;
      },
      check: (value, facts) => {
        seen.push(facts);
        return { ok: value.includes(String((facts as { degrees: number }).degrees)) };
      },
    });
    expect(out).toBe("it is 9 degrees");
    expect(seen).toEqual([{ degrees: 9 }, { degrees: 9 }]);
  });

  it("returns null when the guard refuses, and the caller renders without a model", async () => {
    const { draft } = await seam();
    callModel.mockResolvedValue(reply('{"line":"it is 40 degrees"}'));
    const out = await draft({
      prompt: PROMPT,
      facts: { degrees: 9 },
      maxTokens: 10,
      parse: (json) => (json as { line: string }).line,
      check: () => ({ ok: false, reason: "changed or added a number: 40" }),
    });
    expect(out).toBeNull();
  });
});

describe("every outcome is traced, and they are distinguishable", () => {
  const outcomeOf = (): string | undefined =>
    (traced.mock.calls[0]?.[0] as { outcome?: string } | undefined)?.outcome;

  it("ok", async () => {
    const { draft } = await seam();
    callModel.mockResolvedValue(reply('{"line":"fine"}'));
    await draft({ prompt: PROMPT, facts: null, maxTokens: 10, parse: (j) => (j as { line: string }).line });
    expect(outcomeOf()).toBe("ok");
  });

  it("a model that never answered is not the same byte as a refused draft", async () => {
    const { draft } = await seam();
    callModel.mockResolvedValue(null);
    await draft({ prompt: PROMPT, facts: null, maxTokens: 10, parse: () => "x" });
    expect(outcomeOf()).toBe("model-unavailable");
  });

  it("unparseable", async () => {
    const { draft } = await seam();
    callModel.mockResolvedValue(reply("sorry, no JSON here"));
    await draft({ prompt: PROMPT, facts: null, maxTokens: 10, parse: (j) => (j as { line?: string })?.line ?? null });
    expect(outcomeOf()).toBe("unparseable");
  });

  it("a guard refusal is traced as its own category, not as a generic failure", async () => {
    const { draft } = await seam();
    callModel.mockResolvedValue(reply('{"line":"a badger"}'));
    await draft({
      prompt: PROMPT,
      facts: null,
      maxTokens: 10,
      parse: (j) => (j as { line: string }).line,
      check: () => ({ ok: false, reason: "named a creature the door did not show: a badger" }),
    });
    expect(outcomeOf()).toBe("named-a-creature-the-door-did-not-show");
  });
});

describe("outcomeCode keeps model output out of the trace store", () => {
  it("drops everything after the colon, which is where the quoted words live", async () => {
    const { outcomeCode } = await seam();
    expect(outcomeCode("carries a number the article does not: 47")).toBe(
      "carries-a-number-the-article-does-not"
    );
    expect(outcomeCode("adds a word the source did not have: photosynthesises")).toBe(
      "adds-a-word-the-source-did-not-have"
    );
  });

  it("passes a static reason through as its own slug", async () => {
    const { outcomeCode } = await seam();
    expect(outcomeCode("em dash")).toBe("em-dash");
    expect(outcomeCode("too many words")).toBe("too-many-words");
  });

  it("is bounded, so even a reason that broke the rule could not carry a sentence", async () => {
    const { outcomeCode } = await seam();
    const leaked = outcomeCode("the model said " + "word ".repeat(50));
    expect(leaked.length).toBeLessThanOrEqual(48);
  });

  it("never returns empty", async () => {
    const { outcomeCode } = await seam();
    expect(outcomeCode(undefined)).toBe("rejected");
    expect(outcomeCode(":::")).toBe("rejected");
  });
});

/**
 * Source-level invariants. The repo's own idiom (look-for-honesty.spec.ts,
 * caps-lint) is to assert rules over the source text, because a rule a future
 * author must remember is a rule that will be forgotten.
 */
describe("the rules that make the seam safe are enforceable, not remembered", () => {
  // Recursive over lib/, not just lib/ai. A `check` handed to draft() can be
  // written anywhere — lib/lesson/, a future lib/ai/guards/ — and a scan that
  // only reads one flat directory cannot see it. The same blindness applied to
  // the calls-the-model and writes-a-trace assertions below.
  const collect = (rel: string, out: Array<readonly [string, string]> = []) => {
    let entries;
    try {
      entries = readdirSync(new URL(`../../${rel}/`, import.meta.url), { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      if (e.name === "node_modules") continue;
      if (e.isDirectory()) collect(`${rel}/${e.name}`, out);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
        out.push([`${rel}/${e.name}`, readFileSync(new URL(`../../${rel}/${e.name}`, import.meta.url), "utf8")] as const);
      }
    }
    return out;
  };
  const sources = collect("lib");

  it("only the seam calls the model", () => {
    const callers = sources
      .filter(([name]) => !name.endsWith("/draft.ts") && !name.endsWith("/model.ts"))
      .filter(([, text]) => /\bcallModel\s*\(/.test(text))
      .map(([name]) => name);
    expect(callers).toEqual([]);
  });

  it("only the seam writes a trace", () => {
    const writers = sources
      .filter(([name]) => !name.endsWith("/draft.ts") && !name.endsWith("/langfuse.ts"))
      .filter(([, text]) => /\btrace\s*\(\s*\{/.test(text))
      .map(([name]) => name);
    expect(writers).toEqual([]);
  });

  it("a guard reason may quote the model, but never before its colon", () => {
    // outcomeCode takes the text before the first colon. That is only safe if
    // no reason interpolates before one. Seventeen reasons quote what they
    // caught; every one is written `stable phrase: ${value}`. This is the
    // assertion that keeps the eighteenth honest.
    const offenders: string[] = [];
    for (const [name, text] of sources) {
      // Anchored on the GUARD shape, `{ ok: false, reason: … }`, not on the
      // word "reason". Recursing over lib/ made a bare `reason:` scan match
      // unrelated domain code (expected-silence, the pointmoon contract) that
      // has nothing to do with a draft verdict. All 77 real guard returns use
      // this shape.
      for (const m of text.matchAll(
        /ok:\s*false\s*,\s*reason:\s*(`[^`]*`|"[^"]*"|'[^']*'|[A-Za-z_$][\w$.]*)/g
      )) {
        const raw = m[1] ?? "";
        // A reason built elsewhere and passed by name is unreadable here, so
        // it is refused rather than waved through.
        if (!/^[`"']/.test(raw)) {
          offenders.push(`${name}: reason assembled elsewhere (${raw}) — inline it so this scan can read it`);
          continue;
        }
        const body = raw.slice(1, -1);
        const interp = body.indexOf("${");
        if (interp === -1) continue;
        const colon = body.indexOf(":");
        if (colon === -1 || colon > interp) offenders.push(`${name}: ${body}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * Comments here quote the very shapes the rule forbids — this block explains
   * why `const SYSTEM = [...]` is gone, using those words. Scanning raw source
   * would flag every file that documents the rule it complies with, which is
   * exactly how `look-for-honesty.spec.ts` failed before it grew `copyOnly`.
   */
  const codeOnly = (text: string): string =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/^\s*\/\/.*$/, ""))
      .join("\n");

  it("reads code and not commentary, so the rule can be written down", () => {
    expect(codeOnly("/* const SYSTEM = [`" + "x".repeat(500) + "`] */")).not.toContain("x");
    expect(codeOnly("// a note about long literals\n")).not.toContain("note");
    expect(codeOnly('const s = "kept";')).toContain("kept");
  });

  it("every prompt name that can reach a trace is one the registry names", () => {
    // lesson-support runs ten task variants and traced as "lesson-support-age"
    // while the managed prompt is "lesson-support", so the generation's link
    // to its prompt dangled for the ten highest-volume drafts in the product.
    // draft() now sends `name` for the link and `id` for the display, and this
    // is what catches the next one.
    const registry = readFileSync(new URL("../../lib/ai/prompt-registry.ts", import.meta.url), "utf8");
    const known = new Set(
      [...registry.matchAll(/^\s*"([a-z][a-z0-9-]*)":\s*"[a-z0-9-]+\.md",$/gm)].map((m) => m[1])
    );
    // Non-empty is the real assertion here: an empty set would make the
    // offender check below pass vacuously. The exact count is asserted
    // against the prompts/ directory in prompt-registry.spec.ts.
    expect(known.size).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const [file, text] of sources) {
      for (const m of text.matchAll(/\bname:\s*"([^"]+)"/g)) {
        const value = m[1] ?? "";
        // Only names in the AI surface are prompt names.
        if (!file.startsWith("lib/ai/")) continue;
        if (!known.has(value)) offenders.push(`${file}: name "${value}" is not in PROMPT_FILES`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no prompt text has crept back into lib/ai", () => {
    // Line-based, not a nested-quantifier regex. The previous version used
    // `(?:[^\]]*?\n){6,}` which backtracks catastrophically — invisible over
    // seventeen files, a hang over a hundred once the scan went recursive.
    const offenders: string[] = [];
    for (const [name, raw] of sources) {
      if (!name.startsWith("lib/ai/")) continue;
      const lines = codeOnly(raw).split("\n");
      let openedAt = -1;
      let kind: "array" | "template" | null = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (kind === null) {
          if (/const\s+\w+[^=]*=\s*\[\s*$/.test(line)) { kind = "array"; openedAt = i; }
          else if (/const\s+\w+[^=]*=\s*`[^`]*$/.test(line)) { kind = "template"; openedAt = i; }
          continue;
        }
        if (kind === "array" && /^\s*\]\s*\.join\(/.test(line)) {
          if (i - openedAt > 6) offenders.push(`${name}:${openedAt + 1} a joined array of lines, which is how a prompt used to look`);
          kind = null;
        } else if (kind === "template" && line.includes("`")) {
          if (i - openedAt > 6) offenders.push(`${name}:${openedAt + 1} a multi-line template literal assigned to a const`);
          kind = null;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
