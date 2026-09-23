import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SafetyPage } from "@/app/session/safety/SafetyPage";
import type { LessonHazards } from "@/lib/lesson/hazards";
import { projectLessonJourney } from "@/lib/lesson/journey";
import { loadPack } from "@/lib/pack";

/**
 * THE HAZARDS LAND ON THE PAGE (#417).
 *
 * The brief's guard proves the band LEFT that screen. This is the other half,
 * and it is the half a cut usually forgets. It matters more here than it did
 * for the key words: this is the one list in the product where being wrong
 * hurts a child, so "it moved" is not enough — it has to arrive whole, with
 * the honesty line that says what kind of claim it makes, and it has to say
 * NOT CHECKED out loud when nothing resolved.
 */

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

const autumn = loadPack("autumn-starter");
const leaf = required(
  autumn.sessions.find((session) => session.id === "leaves-and-their-trees"),
  "Leaf collage fixture is missing"
);

function render(hazards: LessonHazards | null) {
  return renderToStaticMarkup(
    createElement(SafetyPage, {
      journey: projectLessonJourney(autumn, leaf),
      weekOf: "week 1 of 4",
      session: leaf,
      activeClass: { name: "Willow class", yearGroup: "Year 1" },
      locale: undefined,
      hazards,
    })
  );
}

const STARTER: LessonHazards = {
  source: "starter",
  entries: [
    { id: "water", name: "Deep or moving water", note: "Set the boundary before anyone moves." },
    { id: "ticks", name: "Ticks", note: "Trousers tucked into socks going in." },
  ],
};

describe("the safety page", () => {
  it("carries every hazard with its note", () => {
    const markup = render(STARTER);
    for (const entry of STARTER.entries) {
      expect(markup).toContain(entry.name);
      expect(markup).toContain(entry.note);
    }
  });

  it("says what kind of claim the list makes, and who leads", () => {
    // The honesty line moved with the band. It is the sentence that stops this
    // page reading as a survey of her actual patch.
    expect(render(STARTER)).toContain("not a survey of your patch");
    expect(render(STARTER)).toContain("Your own risk assessment leads");
    expect(render({ ...STARTER, source: "pack" })).toContain("Written for your region");
  });

  it("shows the receipt on a record-selected entry, and nothing on a universal one", () => {
    const markup = render({
      source: "starter",
      entries: [
        { id: "adder", name: "Adders", note: "Watch the sunny edges.", recordedAs: "Vipera berus" },
        { id: "water", name: "Deep or moving water", note: "Set the boundary first." },
      ],
    });
    expect(markup).toContain("Vipera berus");
    // One receipt, not one per entry: a universal hazard claims only "grounds
    // like yours" and must not borrow the regional entry's evidence.
    expect(markup.match(/Recorded near this school/g)).toHaveLength(1);
  });

  /**
   * The oldest rule in lib/lesson/hazards.ts, and the easiest to lose in a
   * move: an absent list must never render as "there is nothing to worry
   * about". A page that simply came up empty would read exactly that way.
   */
  it("says NOT CHECKED rather than going quietly blank", () => {
    const markup = render(null);
    expect(markup).not.toContain("<dl");
    expect(markup).toContain("Nothing has been checked");
    expect(markup).toContain("not the same as nothing being out there");
  });

  it("gets back to the lesson in one tap", () => {
    expect(render(STARTER)).toContain(`/session?session=${leaf.id}`);
  });
});
