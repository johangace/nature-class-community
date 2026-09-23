import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createGuardSandbox, runGuardOnRepo, type GuardSandbox } from "../support/guard-sandbox";

/**
 * THE CATALOG, AND THE SESSIONS THAT DELIBERATELY CITE NOTHING (#464).
 *
 * `scripts/standards-lint.mjs` is the guard; this file proves it bites, and
 * records the four sessions whose emptiness is a decision rather than a gap.
 *
 * The bite is proved on a disposable copy of the repository, never on the
 * working tree (nc#651): a mutation test that damages `packs/autumn-garden.json`
 * in place is read by every other spec running in parallel, and survives a
 * crash as a truncated grant pack. See `tests/support/guard-sandbox.ts`.
 */

const LINT = "scripts/standards-lint.mjs";
const CATALOG = "scripts/lib/standards-catalog.json";
const GARDEN = "packs/autumn-garden.json";

describe("the standards lint bites", () => {
  let sandbox: GuardSandbox;
  const lint = () => {
    const { status, output } = sandbox.run(LINT);
    return { ok: status === 0, out: output };
  };

  beforeAll(() => {
    sandbox = createGuardSandbox("standards-lint");
  });
  afterEach(() => {
    sandbox.restore();
  });
  afterAll(() => {
    sandbox.dispose();
  });

  it("passes on the packs as they ship", () => {
    // The real repository, read-only — the claim is about what ships.
    expect(runGuardOnRepo(LINT).status).toBe(0);
  });

  it("catches a paraphrased statutory quote — the real defect it was built for", () => {
    // The exact drift found in autumn-garden: the statute writes the numeral.
    sandbox.edit(GARDEN, (s) =>
      s.replace(
        "observe changes across the 4 seasons",
        "observe changes across the four seasons"
      )
    );
    const result = lint();
    expect(result.ok).toBe(false);
    expect(result.out).toContain("four seasons");
    expect(result.out).toContain("published:");
  });

  it("catches a one-word drift inside a quoted NGSS expectation", () => {
    sandbox.edit(GARDEN, (s) =>
      s.replace(
        "different plants and animals (including humans)",
        "different plants or animals (including humans)"
      )
    );
    expect(lint().ok).toBe(false);
  });

  it("catches a citation whose code is not in the catalog at all", () => {
    sandbox.edit(GARDEN, (s) => s.replace('"K-ESS2-1"', '"K-XYZ9-9"'));
    const result = lint();
    expect(result.ok).toBe(false);
    expect(result.out).toContain("no catalog entry");
  });

  it("does not accept a catalog edited to match a drifted session", () => {
    // Both sides changed together still fails, because the catalog entry no
    // longer matches every other session citing the same objective.
    sandbox.edit(CATALOG, (s) =>
      s.replace("observe changes across the 4 seasons", "observe changes across the four seasons")
    );
    expect(lint().ok).toBe(false);
  });
});

describe("sessions that cite nothing, on purpose", () => {
  /**
   * Not gaps. Four sessions have no honest science objective, and a citation
   * invented to fill the field would be exactly the fabrication the catalog
   * exists to prevent. Two are art and design, one is wellbeing, one is a
   * perception exercise. If one of these ever gains a citation, that is a
   * content decision someone should have to argue for — hence this test.
   */
  const DELIBERATELY_EMPTY: Record<string, [string, string]> = {
    "packs/summer.json": ["summer-w3-a5-leaf-collage", "art and design"],
    "packs/spring-term.json": ["spring-w3-natural-paint-making", "art and design"],
  };

  for (const [file, [id, why]] of Object.entries(DELIBERATELY_EMPTY)) {
    it(`${id} cites nothing (${why})`, () => {
      const pack = JSON.parse(readFileSync(file, "utf8"));
      const session = pack.sessions.find((s: { id: string }) => s.id === id);
      expect(session, `${id} not found in ${file}`).toBeTruthy();
      expect(session.standards ?? []).toEqual([]);
    });
  }

  it("the two remaining spring sessions cite nothing either", () => {
    const pack = JSON.parse(readFileSync("packs/spring-term.json", "utf8"));
    for (const id of ["spring-w10-green", "spring-w12-gratitude-walk"]) {
      const session = pack.sessions.find((s: { id: string }) => s.id === id);
      expect(session, `${id} not found`).toBeTruthy();
      expect(session.standards ?? []).toEqual([]);
    }
  });
});
