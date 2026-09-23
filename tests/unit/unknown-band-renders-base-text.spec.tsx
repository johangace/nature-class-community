import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HybridJourney, IntroduceDay } from "@/app/run/HybridJourney";
import { LessonScroll } from "@/app/run/LessonScroll";
import { findSession } from "@/lib/pack";
import { resolveText } from "@/lib/text";
import { abilityBands, sessionSchema, type Session } from "@/schema/pack";

/**
 * A CLASS WHOSE BAND IS UNKNOWN GETS THE BASE TEXT, NOT A FABRICATED ONE
 * (#860).
 *
 * Three render sites defaulted a missing ability band to `"y1"` — a REAL band,
 * with real authored wording behind it:
 *
 *   app/run/HybridJourney.tsx  IntroduceDay   ability = "y1"
 *   app/run/HybridJourney.tsx  HybridJourney  ability = "y1"
 *   app/run/LessonScroll.tsx   LessonScroll   ability = "y1"
 *
 * and every caller can reach them with nothing: `app/run/page.tsx` passes
 * `classBand ?? undefined` and `app/field/FieldShell.tsx` passes no `ability`
 * prop at all. So a class with a null band — signed out, or a year group the
 * app does not recognise — was served the Year 1 wording of any block that
 * authored one, silently, on the DEFAULT runner.
 *
 * IT WAS NOT A LIVE BUG, AND THAT IS THE PROBLEM. The packs author zero `y1`
 * variants (13 `abilityVariants` blocks: y2 ×10, reception ×3), so `resolveText`
 * fell through to the base text every time. The safety was a coincidence of
 * what nobody had written yet, not a property of the code, and it was invisible
 * to the grep that finds the `?? "reception"` sites because the string is "y1".
 *
 * So this file authors the missing variant. Every text-carrying block of a real
 * shipped session is given a `y1` variant IN THIS TEST ONLY (never in a pack —
 * pack copy is Johan's and byte-guarded), and the three surfaces are rendered
 * for a class with no band. Each must show the base text.
 *
 * The positive control below is load-bearing: the same fixture rendered WITH
 * `ability="y1"` must show the fabricated wording. Without it a green here
 * would prove only that the variant never reaches a screen at all, which is the
 * false comfort this ticket exists to remove.
 */

/** The session's own words, replaced wholesale: markers, never curriculum copy. */
const BASE = "BASE-TEXT-860";
/** The Year 1 wording nobody has written — authored here, and only here. */
const FABRICATED = "FABRICATED-Y1-860";

const REAL_SESSION = "meet-your-tree";

/**
 * A real shipped session with every text-carrying block reduced to a marker and
 * given a `y1` variant. Cloned in memory; the pack on disk is untouched.
 */
function bandedFixture(): Session {
  const found = findSession(REAL_SESSION);
  if (!found) throw new Error(`the packs no longer ship ${REAL_SESSION}`);
  const session = structuredClone(found.session);
  let authored = 0;
  for (const phase of session.phases) {
    for (const block of phase.blocks) {
      if (block.type === "say-aloud" || block.type === "teacher-note") {
        block.text = BASE;
      } else if (block.type === "conditions-line") {
        block.fallbackText = BASE;
      } else {
        continue;
      }
      block.abilityVariants = { y1: FABRICATED };
      authored += 1;
    }
  }
  if (authored === 0) throw new Error(`${REAL_SESSION} authors no text blocks`);
  // The fixture is a session the app would accept, not a shape only this file
  // could render: a variant nobody can author is not evidence of anything.
  return sessionSchema.parse(session);
}

/** The settle deck, which is the first screen when a run opens at the settle. */
function settleDeck(session: Session, ability?: (typeof abilityBands)[number]) {
  return renderToStaticMarkup(
    <HybridJourney ability={ability} session={session} startAt="settle" />
  );
}

/** The threshold screen: the last page before the class goes outside. */
function threshold(session: Session, ability?: (typeof abilityBands)[number]) {
  return renderToStaticMarkup(<IntroduceDay ability={ability} session={session} />);
}

/** The whole lesson as one scroll (`?run=scroll`, and the field shell's fallback). */
function scroll(session: Session, ability?: (typeof abilityBands)[number]) {
  return renderToStaticMarkup(<LessonScroll ability={ability} session={session} />);
}

describe("an unknown ability band renders the base text", () => {
  it("resolves to the base text when no band is given", () => {
    // The seam itself: `undefined` means "no variant", never "pick one".
    expect(resolveText(BASE, { y1: FABRICATED }, undefined)).toBe(BASE);
    expect(resolveText(BASE, { y2: FABRICATED }, undefined)).toBe(BASE);
    expect(resolveText(BASE, undefined, undefined)).toBe(BASE);
    // And it still resolves a band that IS known, which is the whole feature.
    expect(resolveText(BASE, { y1: FABRICATED }, "y1")).toBe(FABRICATED);
  });

  it("serves the base text on the settle deck of the default runner", () => {
    const markup = settleDeck(bandedFixture());
    expect(markup).toContain(BASE);
    expect(markup).not.toContain(FABRICATED);
  });

  it("serves the base text on the threshold screen", () => {
    const markup = threshold(bandedFixture());
    expect(markup).toContain(BASE);
    expect(markup).not.toContain(FABRICATED);
  });

  it("serves the base text on the lesson scroll", () => {
    const markup = scroll(bandedFixture());
    expect(markup).toContain(BASE);
    expect(markup).not.toContain(FABRICATED);
  });

  it("still serves the y1 wording to a class that IS Year 1", () => {
    // The control. If these three fail, the assertions above are vacuous.
    const fixture = bandedFixture();
    expect(settleDeck(fixture, "y1")).toContain(FABRICATED);
    expect(threshold(fixture, "y1")).toContain(FABRICATED);
    expect(scroll(fixture, "y1")).toContain(FABRICATED);
  });
});

/**
 * THE FAMILY, NOT THE THREE SITES (#860).
 *
 * A default parameter that names a real band is the trap, and it can be
 * reintroduced in one line by anyone adding a component that renders blocks.
 * `?? "y1"` is the same move written differently — `/api/ask-another-way`
 * carried one, justified in its own comment by the runner default this ticket
 * removes, so the two had to move together or the model would have read wording
 * the teacher's plate was not showing.
 *
 * The `?? "reception"` sites are deliberately NOT covered here: those are a
 * named, documented neutral for the printed surfaces (#54, #783), findable by
 * the grep that this family evaded.
 */
const SOURCE_ROOTS = ["app", "engine", "lib"];

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const root of SOURCE_ROOTS) {
    const dir = join(process.cwd(), root);
    for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
      if (entry.endsWith(".ts") || entry.endsWith(".tsx")) files.push(join(dir, entry));
    }
  }
  return files;
}

/**
 * The lines that actually run. Comment lines are skipped deliberately: the
 * fixes for this ticket QUOTE the shapes below to explain why they went, and a
 * guard a comment can trip is a guard that teaches people to stop writing the
 * explanation.
 */
function codeLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line));
}

describe("no source file fabricates a band for a class that has none", () => {
  it("declares no ability default naming a real band", () => {
    const bands = abilityBands.join("|");
    // The default-parameter form, which is how all three #860 sites were written.
    const asDefault = new RegExp(`^\\s*ability = "(${bands})",?\\s*$`);
    const offenders = sourceFiles().filter((file) =>
      codeLines(file).some((line) => asDefault.test(line))
    );
    expect(offenders).toEqual([]);
  });

  it("never falls back to y1, which is nobody's documented neutral", () => {
    const offenders = sourceFiles().filter((file) =>
      codeLines(file).some((line) => line.includes('?? "y1"'))
    );
    expect(offenders).toEqual([]);
  });
});
