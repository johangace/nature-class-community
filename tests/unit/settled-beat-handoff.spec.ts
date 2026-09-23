import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSession, loadPack, packOrder } from "@/lib/pack";

/**
 * #136: the settled beat's handoff line built its sentence out of the next
 * phase's own title — `begin {afterSettleTitle.toLowerCase()}` — which reads
 * fine for a verb phrase ("begin walk.") and reads as nonsense for a noun-ish
 * label ("begin engage."). Summer week 2 "Minibeast hunting" is the session
 * that actually hits this: its phase 2 (after the settling ritual is spliced
 * in as phase 1, see lib/pack.ts's `loadPack`) is titled "Engage", lifted from
 * an Engage/Explore/Identify/Appreciate structure, not a verb.
 *
 * The fix drops the phase name from the sentence entirely. The button beside
 * it ("Begin: Engage &rarr;") still names the phase, so nothing informational
 * is lost, and no future phase title can ever break this sentence again.
 */

function runnerSource(): string {
  return readFileSync(new URL("../../app/run/Runner.tsx", import.meta.url), "utf8");
}

describe("the settled beat's handoff line names no phase", () => {
  it("renders the fixed sentence with no interpolation, anywhere in the source", () => {
    const runner = runnerSource();

    expect(runner).toContain("When you&rsquo;re ready, begin.");
    // The old interpolation must be gone outright, not just from this one
    // line -- a stray second use would be exactly the kind of drift this
    // test exists to catch.
    expect(runner).not.toMatch(/begin \{afterSettleTitle/);
    expect(runner).not.toMatch(/afterSettleTitle\.toLowerCase\(\)/);
  });

  it("keeps afterSettleTitle for the button, which names the phase on purpose", () => {
    const runner = runnerSource();

    // "Begin: Engage" style button copy is fine -- it doesn't build a
    // sentence, so a noun-ish phase title reads naturally there. Only the
    // prose line had the grammar problem.
    expect(runner).toContain("const afterSettleTitle =");
    expect(runner).toContain("`Begin: ${afterSettleTitle}`");
  });

  it("the settle-check paragraph is exactly one static sentence, not a template", () => {
    const runner = runnerSource();
    const marker = 'className="settle-check-sub"';
    const start = runner.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const paragraph = runner.slice(start, runner.indexOf("</p>", start));

    expect(paragraph).toContain("When you&rsquo;re ready, begin.");
    // No JSX expression container at all in this paragraph -- nothing from
    // session or phase data can ever feed back into this sentence.
    expect(paragraph).not.toMatch(/\{[^}]*\}/);
  });

  it("summer week 2 'Minibeast hunting' is the exact regression this ticket reports", () => {
    // This is the session that broke the old sentence: settle:true means
    // loadPack splices the shared settling in as phase 0, so phase 1 -- the
    // phase the handoff line used to name -- is this session's own
    // "Engage", not a verb.
    const session = getSession(loadPack("summer"), "summer-w2-minibeast-hunting");

    expect(session.settle).toBe(true);
    expect(session.phases[0]?.key).toBe("settle");
    expect(session.phases[1]?.title).toBe("Engage");

    // Under the old code this session would have produced:
    //   `When you're ready, begin ${"Engage".toLowerCase()}.`
    //   => "When you're ready, begin engage."
    // The fixed line no longer reads session.phases[1]?.title at all, so
    // this session (and any future noun-titled phase) can't reintroduce it.
  });

  it("every settle-bearing session across every shelved and off-shelf pack gets the same safe sentence", () => {
    const settleBearing: Array<{ pack: string; sessionId: string; nextTitle: string }> = [];

    for (const packId of packOrder) {
      const pack = loadPack(packId);
      for (const session of pack.sessions) {
        if (!session.settle) continue;
        settleBearing.push({
          pack: packId,
          sessionId: session.id,
          nextTitle: session.phases[1]?.title ?? "",
        });
      }
    }

    // There is at least one settle-bearing session to guard, and the known
    // regression case is among them.
    expect(settleBearing.length).toBeGreaterThan(0);
    expect(settleBearing).toContainEqual({
      pack: "summer",
      sessionId: "summer-w2-minibeast-hunting",
      nextTitle: "Engage",
    });

    // Whatever each session's next-phase title is -- verb phrase or noun --
    // the handoff line no longer reads it, so every one of these sessions
    // renders the identical, grammatically-safe sentence. The paragraph
    // assertion above is what actually proves that; this list just makes
    // sure the regression case (and any sibling that shows up later) stays
    // covered instead of silently dropping out of the suite.
    for (const { nextTitle } of settleBearing) {
      expect(typeof nextTitle).toBe("string");
    }
  });
});
