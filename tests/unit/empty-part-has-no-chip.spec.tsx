import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HybridJourney } from "@/app/run/HybridJourney";
import { doorQuestions } from "@/lib/lesson/door";
import { loadAllPacks } from "@/lib/pack";
import { resolvePhases } from "@/lib/resolve";
import { phaseMoments } from "@/lib/run/phase-moments";
import type { Session } from "@/schema/pack";

/**
 * A PART WITH NO MOMENTS IS NOT A CHIP (#1194).
 *
 * The sibling spec `empty-parts-have-no-door.spec.ts` pins the RULE, over the
 * walk. This one pins that the rule reaches the markup a teacher receives,
 * because the failure it guards is the #738 one: the strip's skip is four
 * lines of JSX, and a source-string assertion goes green the moment somebody
 * lifts the condition into a helper or filters upstream — both of which leave
 * behaviour identical — while going RED on a reformat that changes nothing.
 * Rendering it asks the only question that matters: is the chip there?
 *
 * `startAt="settle"` is the one interior screen a static render can reach
 * (`journey-back-navigation.spec.tsx` says why), and the grounding page draws
 * the same `partStrip()` every outdoor page draws.
 */

/** A shipped session, and the question its board asks before anyone goes out. */
function shippedWithADoorQuestion(): { session: Session; asked: string } | null {
  for (const session of loadAllPacks().flatMap((pack) => pack.sessions)) {
    const asked = doorQuestions(session)[0]?.question;
    if (asked) return { session, asked };
  }
  return null;
}

/**
 * The same session with one body part's every line already asked at the door,
 * which is exactly how a part empties in production: `phaseMoments` drops a
 * spoken line that says the words the board already said (#1008).
 */
function withAnEmptiedPart(session: Session, asked: string, title: string): Session {
  const copy = structuredClone(session);
  for (const phase of copy.phases) {
    if (phase.title === title) phase.blocks = [{ type: "say-aloud", text: asked }];
  }
  return copy;
}

function partStripOf(markup: string): string {
  const start = markup.indexOf('aria-label="Parts of this lesson"');
  expect(start).toBeGreaterThan(-1);
  return markup.slice(start, markup.indexOf("</nav>", start));
}

describe("the part strip offers no chip for a part with nothing to say (#1194)", () => {
  const found = shippedWithADoorQuestion();

  it("finds a shipped session to build the case on", () => {
    expect(found).not.toBeNull();
  });

  if (!found) return;
  const { session, asked } = found;

  // The second body part, whichever it is: not the first (which may be the
  // introduction the walk hoists indoors) and not the circle.
  const bodyTitles = resolvePhases(session, null)
    .filter(
      (phase) =>
        phase.key !== "settle" &&
        !phase.blocks.some((block) => block.type === "circle-question")
    )
    .map((phase) => phase.title);
  const emptied = bodyTitles[1]!;

  it("builds a part that really is empty, rather than assuming one", () => {
    const before = resolvePhases(session, null).find((phase) => phase.title === emptied);
    expect(phaseMoments(before!, [asked]).length).toBeGreaterThan(0);

    const after = resolvePhases(withAnEmptiedPart(session, asked, emptied), null).find(
      (phase) => phase.title === emptied
    );
    expect(phaseMoments(after!, [asked]).length).toBe(0);
  });

  it("drops its chip and keeps every other part's", () => {
    const before = partStripOf(
      renderToStaticMarkup(<HybridJourney session={session} startAt="settle" />)
    );
    expect(before).toContain(emptied);

    const after = partStripOf(
      renderToStaticMarkup(
        <HybridJourney session={withAnEmptiedPart(session, asked, emptied)} startAt="settle" />
      )
    );
    expect(after).not.toContain(emptied);
    for (const title of bodyTitles) {
      if (title !== emptied) expect(after).toContain(title);
    }
    // The grounding chip is not a part and never leaves.
    expect(after).toContain("Ground the class");
  });
});
