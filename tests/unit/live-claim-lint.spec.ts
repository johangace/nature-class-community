import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DISTINCTIVE_MIN_CHARS,
  authoredConditionsLines,
  claimsLive,
  isDistinctive,
  partitionByFloor,
  scanSource,
  sourceFiles,
  // @ts-expect-error -- a plain .mjs check, imported for its rules rather than
  // re-implemented here. Same shape as tests/unit/guard-mutation-check.spec.ts.
} from "../../scripts/live-claim-lint.mjs";

/**
 * nc#855, held against its own defect.
 *
 * `app/start/LiveOutside.tsx` printed a pack's authored conditions line under
 * the eyebrow `outside now · {class} · live`. The component was deleted with
 * the location step's rebuild (#933), which fixed the site and not the shape:
 * nothing in the build had stopped it being written, and nothing would stop the
 * next one.
 *
 * So the defect is reconstructed here rather than remembered. The sentence is
 * READ OUT OF THE PACK, never typed — it is Johan's curriculum, this file has
 * no business holding a copy of it, and a copy here would be the very fork the
 * rule forbids. If the packs' line is ever reworded, this test follows it.
 *
 * `scripts/guard-mutation-check.mjs` proves the same three rules bite from the
 * CI step's side, on a planted violation in a sandboxed tree. This is the
 * behavioural half: the rules judged directly, on the real shape of the bug.
 */

type Finding = { rule: string; file: string; line: number; message: string };

const authored: Map<string, Set<string>> = authoredConditionsLines();

/** The line seven packs author, taken from the packs. */
const PACK_LINE = [...authored.keys()].find((line) =>
  (authored.get(line) as Set<string>).size >= 7
) as string;

/** The component as it stood, reduced to the three lines that were the bug. */
const AS_IT_WAS = `
export function LiveOutside({ className, data }: Props) {
  const headline =
    data.conditions.line ??
    ${JSON.stringify(PACK_LINE)};

  return (
    <section className="outside-card">
      <p className="outside-eyebrow">{\`outside now · \${className} · live\`}</p>
      <h2 className="outside-headline">{headline}</h2>
    </section>
  );
}
`;

const rulesOf = (findings: Finding[]) => findings.map((f) => f.rule).sort();

describe("the corpus the rules are held against", () => {
  it("harvests the conditions lines the packs author", () => {
    // A harvest that came back empty would forbid nothing and report green,
    // which is the shape nc#554 taught this repo to distrust. The CLI refuses
    // to run on it; this is the same refusal, asserted.
    expect(authored.size).toBeGreaterThan(0);
    expect(PACK_LINE, "the seven-pack conditions line is still in the packs").toBeTruthy();
  });
});

describe("nc#855, as it was written", () => {
  const findings: Finding[] = scanSource("app/start/LiveOutside.tsx", AS_IT_WAS, authored);

  it("is caught three separate ways", () => {
    expect(rulesOf(findings)).toEqual([
      "live-label-over-a-default-sentence",
      "null-read-coalesced",
      "pack-line-copied",
    ]);
  });

  it("names where the curriculum actually authors the sentence", () => {
    const copied = findings.find((f) => f.rule === "pack-line-copied") as Finding;
    expect(copied.message).toContain("packs/autumn-starter.json");
  });

  it("stays caught when the sentence is one nobody authored", () => {
    // Rule 1 is blind to a NEW invented sentence by construction — there is no
    // pack row to compare it against. The mechanism rule is what covers that,
    // and this is the case where it has to work alone.
    const invented = AS_IT_WAS.replace(
      JSON.stringify(PACK_LINE),
      '"A sky nobody read, described anyway, in a plausible sentence."'
    );
    expect(rulesOf(scanSource("app/probe.tsx", invented, authored))).toEqual([
      "live-label-over-a-default-sentence",
      "null-read-coalesced",
    ]);
  });

  it("cannot be silenced by moving the sentence into a comment", () => {
    // Every rule reads what a file DOES. A check that read prose could be
    // quieted by a `//`, and would go red on the header explaining the rule.
    const commented = `// ${PACK_LINE}\n/* ${PACK_LINE} */\nexport const nothing = 1;\n`;
    expect(scanSource("app/probe.tsx", commented, authored)).toEqual([]);
  });
});

describe("what a live surface is still allowed to say", () => {
  it("may say outright that it could not see outside", () => {
    // DailyCard's honest silence. The sentence is house copy reporting a
    // failed read, not a sentence standing in for a reading, and banning it
    // would push the surface back towards filling the gap.
    const honest = `
export function Quiet() {
  return (
    <section>
      <p className="outside-eyebrow"><span className="live-dot" />outside now</p>
      <p>We could not see outside today, so there is nothing new to report.</p>
    </section>
  );
}
`;
    expect(claimsLive(honest)).toBe(true);
    expect(scanSource("app/probe.tsx", honest, authored)).toEqual([]);
  });

  it("may default a short label, which is not a reading", () => {
    const label = 'const shown = place.label ?? "the position we have";\n';
    expect(scanSource("app/probe.tsx", label, authored)).toEqual([]);
  });

  it("does not read `let live = true` as a claim about the weather", () => {
    expect(claimsLive("let live = true;\nconst c = 'Open the live guide';\n")).toBe(false);
  });
});

describe("nc#994: a pack line too short to be evidence", () => {
  /**
   * `schema/pack.ts` accepts `fallbackText: z.string().min(1)`, so this is a
   * conditions line a pack is entitled to author today. Before the floor, rule
   * 1 answered it with three findings on files nobody had forked anything into
   * — `app/field/print/FieldPrint.tsx:180`, `lib/offline/readiness.ts:2` and
   * `lib/outside/place.ts:152` — aimed at an author who had opened none of
   * them. That is how a working guard stops being believed.
   */
  const SHORT = "the sky";

  /** The harvest as it would be with that line authored in a future pack. */
  const withShort = new Map(authored);
  withShort.set(SHORT, new Set(["packs/future-pack.json"]));

  it("names no file in the tree", () => {
    const hits = (sourceFiles() as string[]).flatMap((path) =>
      scanSource(path, readFileSync(path, "utf8"), withShort)
    );
    expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual([]);
  });

  it("is still caught by rule 2 when it stands in for a reading", () => {
    // The floor withdraws rule 1 from short lines and nothing else. The
    // mechanism rules do not read the corpus at all, and the note the CLI
    // prints says so, so this is that claim held to account.
    const coalesced = `export const headline = (d: D) => d.conditions.line ?? ${JSON.stringify(SHORT)};\n`;
    expect(rulesOf(scanSource("app/probe.tsx", coalesced, withShort))).toEqual([
      "null-read-coalesced",
    ]);
  });

  it("is reported as exempt rather than silently dropped", () => {
    const { enforced, exempt } = partitionByFloor(withShort);
    expect([...exempt.keys()]).toEqual([SHORT]);
    expect(enforced.size).toBe(authored.size);
  });

  it("does not exempt a single line the packs actually ship", () => {
    // The floor is only honest while it is far below the curriculum. If a real
    // conditions line ever falls under it, rule 1 has quietly stopped covering
    // the packs and this goes red rather than the coverage going missing.
    for (const line of authored.keys()) {
      expect(isDistinctive(line), `${JSON.stringify(line)} is below the floor`).toBe(true);
    }
  });

  it("states its reach in the finding, so the floor is discoverable", () => {
    const copied = scanSource(
      "app/probe.tsx",
      `export const x = ${JSON.stringify(PACK_LINE)};\n`,
      authored
    ).find((f: Finding) => f.rule === "pack-line-copied") as Finding;
    expect(copied.message).toContain(`${DISTINCTIVE_MIN_CHARS} characters or more`);
  });
});

describe("the tree as it stands", () => {
  it("has no surface that can print a conditions line it did not read", () => {
    const violations = (sourceFiles() as string[]).flatMap((path) =>
      scanSource(path, readFileSync(path, "utf8"), authored)
    );
    expect(violations.map((v) => v.message)).toEqual([]);
  });
});
