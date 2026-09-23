import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntroduceDay } from "@/app/run/HybridJourney";
import { findSession } from "@/lib/pack";

/**
 * THE HINGE REACHES THE DAY SCREEN IN BOTH REGISTERS (#1007, #1004 beat 2).
 * The teacher line is a note, never spoken; the child line is spoken and
 * wears the speech marks (#232). A note with no child line leaves the spoken
 * register off the screen entirely, never a placeholder.
 *
 * AND IT IS A LABELLED NOTE NOW (2026-09-08). Johan: *"the top slot can become
 * smaller and less relevant. we can add the lesson note on the runner inside
 * with a conditions or something label only when we have it"*. So the teacher
 * lane gained a label and a mark drawn for the kind that matched; the child
 * line did not move, and the two assertions about it below are unchanged.
 */
// Without its season note, so the only spoken line on the screen is the one
// this file is about; the always-on season line is pinned in
// introduce-today-one-purpose.spec.tsx.
const session = { ...findSession("summer-w2-minibeast-hunting")!.session, seasonNote: undefined };

describe("the hinge on the day screen", () => {
  it("reads the teacher line in the guide, and says only the child line when presented", () => {
    // Johan, 2026-09-06: one screen, two readings. The guide in the hand
    // keeps the teacher line as a note; presented to the class, it is gone.
    const hinge = { teacher: "Lift slowly and look before anything moves.", child: "The air is still today. We might meet one under a log.", kind: "still" as const };
    const guide = renderToStaticMarkup(<IntroduceDay hinge={hinge} session={session} />);
    expect(guide).toMatch(/class="[^"]*_note_[^"]*"[^>]*>Lift slowly and look before anything moves\./);
    expect(guide).toMatch(/_spoken_[^>]*>[\s\S]*The air is still today/);
    const presented = renderToStaticMarkup(<IntroduceDay board hinge={hinge} session={session} />);
    expect(presented).not.toContain("Lift slowly and look before anything moves.");
    expect(presented).toMatch(/_spoken_[^>]*>[\s\S]*The air is still today/);
    expect(presented).toContain("_quote_");
  });

  it("heads the teacher lane with the label and its mark, and never the class's", () => {
    // The label and the mark are written to the adult, so they travel with the
    // teacher line behind `!board`. Presented, the class gets the spoken line
    // and nothing that says a note was consulted.
    const hinge = { teacher: "Lift slowly and look before anything moves.", child: "The air is still today.", kind: "still" as const };
    const guide = renderToStaticMarkup(<IntroduceDay hinge={hinge} session={session} />);
    expect(guide).toContain("Today\u2019s conditions");
    expect(guide).toMatch(/_conditionMark_/);
    // The mark is drawn in the sky marks' pen, and it is decorative: the label
    // beside it and the note under it are the words that license it.
    expect(guide).toMatch(/viewBox="0 0 44 44"[^>]*stroke="currentColor"/);
    expect(guide).toMatch(/_conditionMark_[\s\S]{0,200}aria-hidden="true"/);

    const presented = renderToStaticMarkup(<IntroduceDay board hinge={hinge} session={session} />);
    expect(presented).not.toContain("Today\u2019s conditions");
    expect(presented).not.toMatch(/_conditionMark_/);
  });

  it("draws no label, no mark and no space when no note fired", () => {
    // #1007's ruling, held at the new position: the empty case renders as
    // nothing at all. Not a placeholder, not "no conditions today".
    const markup = renderToStaticMarkup(<IntroduceDay session={session} />);
    expect(markup).not.toContain("Today\u2019s conditions");
    expect(markup).not.toMatch(/_conditionMark_|_conditionNote_/);
  });

  it("keeps the spoken register off the screen while a note has only its teacher line", () => {
    const markup = renderToStaticMarkup(
      <IntroduceDay hinge={{ teacher: "Lift slowly and look before anything moves.", child: null, kind: "still" }} session={session} />
    );
    expect(markup).toContain("Lift slowly");
    expect(markup).not.toContain("_spoken_");
  });
});
