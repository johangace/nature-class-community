import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMPT_FILES, loadPrompt, loadSections } from "@/lib/ai/prompt-registry";

describe("every named prompt loads and is reachable", () => {
  const ids = Object.keys(PROMPT_FILES) as Array<keyof typeof PROMPT_FILES>;

  it("names every prompt file on disk, and no more", () => {
    // Tied to what is actually in prompts/ rather than a hardcoded count that
    // has to be edited every time a prompt is added or retired — a magic
    // number nobody maintains is a check that eventually only measures how
    // long ago someone last updated it.
    const onDisk = readdirSync(new URL("../../prompts/", import.meta.url))
      .filter((f) => f.endsWith(".md"))
      .sort();
    expect(Object.values(PROMPT_FILES).sort()).toEqual(onDisk);
  });

  it.each(ids)("%s has a file with a usable version", (id) => {
    // Loaded WITHOUT variables: templated prompts refuse rather than ship a
    // half-substituted system prompt, and that refusal is the assertion.
    const raw = readFileSync(new URL(`../../prompts/${PROMPT_FILES[id]}`, import.meta.url), "utf8");
    const version = Number(/^version:\s*(\d+)$/m.exec(raw)?.[1]);
    // Langfuse rejects promptVersion 0 inside a 207, silently.
    expect(version).toBeGreaterThanOrEqual(1);
  });

  it("refuses rather than sending a half-filled prompt to the model", async () => {
    // world-extract declares two variables. Given none, the answer is null —
    // "{{featureList}}" sitting in a system prompt is an instruction the model
    // would try to make sense of.
    expect(loadPrompt("world-extract")).toBeNull();
  });

  it("composes when the variables are supplied", async () => {
    const p = loadPrompt("species-id", { speciesList: '"Rock Dove"' });
    expect(p?.system).toContain('"Rock Dove"');
    expect(p?.system).not.toContain("{{");
  });

  it("pulls the house voice in from one shared file, not seven paraphrases", async () => {
    const shared = readFileSync(new URL("../../prompts/_shared/house-rules.md", import.meta.url), "utf8").trim();
    const opening = shared.slice(0, 60);
    for (const id of ["nature-grounding-line"] as const) {
      expect(await loadPrompt(id)?.system).toContain(opening);
    }
  });

  it("reads the ten lesson-support task rules from a file, not a TypeScript record", async () => {
    const rules = loadSections("lesson-support-tasks");
    expect(Object.keys(rules ?? {})).toHaveLength(10);
    expect(rules?.age).toContain("Keep the same purpose");
  });
});

describe("a prompt with no consumer is a finding, not a file nobody notices", () => {
  it("every named prompt is loaded somewhere in the code", async () => {
    // The scan includes scripts/. An earlier audit called look-for-line dead
    // on a grep that covered only app/ and lib/ — its consumer is
    // scripts/probe-seasonal.mjs, the measurement instrument for an open
    // ticket. "Reachable only from a probe" is un-productised, not dead, and
    // the two want different fixes.
    const roots = ["lib", "app", "scripts", "engine"];
    const files: string[] = [];
    const walk = (dir: string) => {
      let entries;
      try {
        entries = readdirSync(new URL(`../../${dir}/`, import.meta.url), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name === "node_modules") continue;
        if (e.isDirectory()) walk(`${dir}/${e.name}`);
        else if (/\.(ts|tsx|mjs)$/.test(e.name)) files.push(`${dir}/${e.name}`);
      }
    };
    roots.forEach(walk);
    const haystack = files
      .filter((f) => !f.endsWith("prompt-registry.ts"))
      .map((f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"))
      .join("\n");

    const orphans = (Object.keys(PROMPT_FILES) as string[]).filter(
      (id) => !haystack.includes(`"${id}"`)
    );
    expect(orphans).toEqual([]);
  });
});
