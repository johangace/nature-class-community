import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HybridJourney } from "@/app/run/HybridJourney";
import { findSession } from "@/lib/pack";

/**
 * DARK MOSS IS A STATE, NOT THE LIVE REGISTER (#870).
 *
 * The hybrid runner defaulted `outdoor` to true, so crossing the threshold
 * turned the ground dark moss — the reading being that a running lesson should
 * look different from a prepared one. Johan rejected that on 2 September: "NO
 * this does not respect our colors."
 *
 * The rule behind the rejection is the one this product already holds itself
 * to: colour means state. `.run.outdoor` already means one specific thing, and
 * it is not "a lesson is running" — it is the GLARE answer, the ground that
 * survives a phone held up in sun. Spending it on the lifecycle takes the
 * meaning off it and hands a teacher indoors a sun palette she never asked for.
 *
 * Three things are pinned, and the middle one is why this file exists rather
 * than a one-word diff:
 *
 *   1. The live guide opens on paper.
 *   2. The TOGGLE SURVIVES. This is a deletion of a default, not the removal
 *      of a mode, and the difference is the whole ruling. A later change that
 *      "simplified" by dropping the control would satisfy assertion 1 while
 *      destroying the thing the ruling protects.
 *   3. The outdoor register itself survives in globals.css, for the same
 *      reason.
 */

const found = findSession("summer-w1-counting-life");
if (!found) throw new Error("Counting life fixture is missing");

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const RUNNER = readFileSync(
  new URL("../../app/run/HybridJourney.tsx", import.meta.url),
  "utf8"
);

describe("the live guide respects the product's colours (#870)", () => {
  const doorstep = renderToStaticMarkup(<HybridJourney session={found.session} />);
  // The settle deck is the one interior screen a static render reaches, and
  // it is where the light control lives.
  const teaching = renderToStaticMarkup(
    <HybridJourney session={found.session} startAt="settle" />
  );

  it("opens on paper, not on dark moss", () => {
    expect(doorstep).not.toContain('data-outdoor="true"');
    expect(teaching).not.toContain('data-outdoor="true"');
  });

  it("still offers the sun, because glare is real", () => {
    // The control lives on the teaching screens, which a static render cannot
    // reach — the head renders it only once the work phase is up. So the
    // source is read for it, the same way this suite reads globals.css: what
    // matters is that the mode was not quietly removed along with its default.
    expect(RUNNER).toContain("Switch to outdoor light");
    expect(RUNNER).toContain("const [outdoor, setOutdoor] = useState(false);");
  });

  it("keeps the outdoor register defined for when she flips it", () => {
    expect(CSS).toContain('[data-outdoor="true"]');
    expect(CSS).toContain(".run.outdoor");
  });
});
