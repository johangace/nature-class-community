import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/**
 * REACH, not correctness (#350).
 *
 * The matcher is unit-tested next door and every one of those tests passed
 * while the feature reached nobody: the first pass wired the provider into
 * `Runner`, which is `?run=legacy`. The default is the hybrid journey, the
 * third is the scrolled one, and neither was wrapped. A green suite and a
 * teacher who sees nothing.
 *
 * So this watches the wiring itself. It is blunt on purpose — a source scan
 * that fails loudly when someone adds a fourth run mode and forgets.
 */
describe("the glossary reaches every run mode", () => {
  const page = read("app/run/page.tsx");

  it("wraps all three modes from the page, not from inside one runner", () => {
    expect(page).toContain("GlossaryProvider");
    // Three returns, three wraps: scroll, hybrid, legacy.
    expect(page.match(/<GlossaryProvider/g) ?? []).toHaveLength(3);
    expect(page.match(/<\/GlossaryProvider>/g) ?? []).toHaveLength(3);
  });

  it("feeds it the session's own authored glossary", () => {
    expect(page).toMatch(/groundedSession\.primer\?\.glossary/);
  });

  it("glosses the teacher's own line in the default journey", () => {
    const hybrid = read("app/run/HybridJourney.tsx");
    expect(hybrid).toContain("GlossedText");
    // The teacher note asks for the gloss; the spoken line must not. Anchored
    // on renderMomentBlock, because the block types are also matched further up
    // where the speak-and-show cards are assembled from plain strings.
    const render = hybrid.slice(hybrid.indexOf("const renderMomentBlock"));
    const branch = (type: string) =>
      render.slice(render.indexOf(`block.type === "${type}"`)).split("</p>")[0] ?? "";
    expect(branch("teacher-note")).toMatch(/linked\([\s\S]*?,\s*at,\s*true\)/);
    expect(branch("say-aloud")).not.toMatch(/,\s*true\)/);
  });

  it("glosses the engine's teacher-note renderer, which the other modes use", () => {
    const renderer = read("engine/renderers/teacher-note.tsx");
    expect(renderer).toContain("GlossedText");
    const sayAloud = read("engine/renderers/say-aloud.tsx");
    expect(sayAloud).not.toContain("GlossedText");
  });
});

/**
 * The other half of reach: the words themselves. A live glossary over sessions
 * that carry no terms is a feature nobody meets.
 */
describe("the sessions that carry the words", () => {
  it("counts what is authored, so a regression in coverage is visible", async () => {
    const { readdirSync } = await import("node:fs");
    const dir = resolve(root, "packs");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

    let withGlossary = 0;
    let without = 0;
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if ("primer" in record) {
        const primer = record.primer as { glossary?: unknown[] } | null;
        if (primer?.glossary && primer.glossary.length > 0) withGlossary += 1;
        else without += 1;
      }
      Object.values(record).forEach(walk);
    };
    for (const file of files) walk(JSON.parse(read(`packs/${file}`)));

    // 40 of 48 on 2026-08-18. The eight without are named on #350; this holds
    // the line so a new session cannot quietly ship wordless.
    expect(withGlossary).toBeGreaterThanOrEqual(40);
    expect(without).toBeLessThanOrEqual(8);
  });
});
