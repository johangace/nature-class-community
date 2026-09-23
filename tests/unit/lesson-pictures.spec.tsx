import { existsSync, readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LessonPictures } from "@/app/run/LessonPictures";
import {
  authoredPictures,
  offersImaginativeChoice,
  pictureMomentOf,
  picturesForMoment,
} from "@/lib/lesson/pictures";
import { shouldShowDoorEvidence } from "@/lib/lesson/media-visibility";
import { doorQuestions } from "@/lib/lesson/door";
import { phaseMoments } from "@/lib/run/phase-moments";
import type { LessonPictures as PictureSet, Session } from "@/schema/pack";

/**
 * THE LESSON PICTURE MODEL (#1078).
 *
 * This spec replaces four that were deleted with the components they tested —
 * `woodlouse-example`, `seed-example`, `mask-making-pictures` and
 * `mask-animal-illustrations`. Each of those asserted that ONE hardcoded
 * lesson showed ONE hardcoded picture, which is the arrangement the ticket
 * removes: a test that names a session id can only ever protect the session
 * somebody thought to name.
 *
 * What is asserted here instead is the RULE, against every shipped session.
 */

const sessions: Session[] = readdirSync(new URL("../../packs", import.meta.url))
  .filter((file) => file.endsWith(".json"))
  .flatMap(
    (file) =>
      JSON.parse(
        readFileSync(new URL(`../../packs/${file}`, import.meta.url), "utf8")
      ).sessions ?? []
  );

const find = (id: string) => {
  const session = sessions.find((candidate) => candidate.id === id);
  if (!session) throw new Error(`no session ${id}`);
  return session;
};

describe("every authored picture", () => {
  it("points at a file that ships", () => {
    for (const session of sessions) {
      for (const set of authoredPictures(session)) {
        for (const item of set.items) {
          expect(item.src, `${session.id} ${item.src}`).toMatch(/^\//);
          expect(
            existsSync(new URL(`../../public${item.src}`, import.meta.url)),
            `${session.id} authors ${item.src}, which is not in public/`
          ).toBe(true);
        }
      }
    }
  });

  it("describes itself for a screen reader without repeating the caption", () => {
    for (const session of sessions) {
      for (const set of authoredPictures(session)) {
        for (const item of set.items) {
          expect(item.alt.trim().length, `${session.id} ${item.src}`).toBeGreaterThan(0);
          if (item.caption) expect(item.alt, `${session.id} ${item.src}`).not.toBe(item.caption);
        }
      }
    }
  });

  /**
   * THE ONCE RULE, WHICH IS THE WHOLE REGRESSION (#1019, reopened by #961).
   *
   * Walking the mask lesson on 2026-09-08, the same four illustrations
   * rendered on three consecutive screens because a component keyed on a
   * session id was mounted at four call sites and nothing could see that the
   * picture had already been shown. An anchor is one screen, so a picture may
   * be authored at exactly one anchor.
   */
  it("is authored at exactly one anchor in its session", () => {
    for (const session of sessions) {
      const seen = new Map<string, number>();
      for (const set of authoredPictures(session)) {
        for (const item of set.items) seen.set(item.src, (seen.get(item.src) ?? 0) + 1);
      }
      for (const [src, count] of seen) {
        expect(count, `${session.id} authors ${src} at ${count} anchors`).toBe(1);
      }
    }
  });
});

describe("which moment a phase's pictures land on", () => {
  const phase = (pictures: PictureSet | undefined) => ({ pictures });
  const moment = (...types: string[]) => ({ blocks: types.map((type) => ({ type })) as never });

  it("puts a how-to with the demonstration, because that is what it is", () => {
    const steps: PictureSet = { purpose: "how-to", items: [{ src: "/a.webp", alt: "a" }] };
    expect(
      pictureMomentOf(phase(steps), [moment("say-aloud"), moment("demo"), moment("say-aloud")])
    ).toBe(1);
  });

  it("falls to the first moment when the phase demonstrates nothing", () => {
    const steps: PictureSet = { purpose: "how-to", items: [{ src: "/a.webp", alt: "a" }] };
    expect(pictureMomentOf(phase(steps), [moment("say-aloud"), moment("say-aloud")])).toBe(0);
  });

  it("puts everything else at the head of the phase", () => {
    for (const purpose of ["example", "choose-from"] as const) {
      const set: PictureSet = { purpose, items: [{ src: "/a.webp", alt: "a" }] };
      expect(pictureMomentOf(phase(set), [moment("say-aloud"), moment("demo")])).toBe(0);
    }
  });

  it("is null where the phase authors nothing, so the species strip may have the slot", () => {
    expect(pictureMomentOf(phase(undefined), [moment("say-aloud")])).toBeNull();
    expect(picturesForMoment(phase(undefined), 0, [moment("say-aloud")])).toBeNull();
  });

  it("shows on that moment and no other", () => {
    const steps: PictureSet = { purpose: "how-to", items: [{ src: "/a.webp", alt: "a" }] };
    const moments = [moment("say-aloud"), moment("demo"), moment("say-aloud")];
    expect(picturesForMoment(phase(steps), 1, moments)).toBe(steps);
    expect(picturesForMoment(phase(steps), 0, moments)).toBeNull();
    expect(picturesForMoment(phase(steps), 2, moments)).toBeNull();
  });
});

describe("a lesson that hands a child an imaginative choice", () => {
  it("withholds the species board, from what it authors rather than from its name", () => {
    const masks = find("animal-leaf-masks");
    expect(offersImaginativeChoice(masks)).toBe(true);
    expect(shouldShowDoorEvidence(masks)).toBe(false);
  });

  it("leaves a lesson about real creatures alone", () => {
    const minibeasts = find("summer-w2-minibeast-hunting");
    expect(offersImaginativeChoice(minibeasts)).toBe(false);
    expect(shouldShowDoorEvidence(minibeasts)).toBe(true);
  });

  it("does not fire on an example or a how-to, which claim nothing about the lesson", () => {
    const seeds = find("seed-searchers");
    expect(authoredPictures(seeds).length).toBeGreaterThan(0);
    expect(offersImaginativeChoice(seeds)).toBe(false);
  });
});

describe("the three questions of the minibeast hunt", () => {
  const questions = doorQuestions(find("summer-w2-minibeast-hunting"));

  it("answers the two questions about CREATURES with a board a child can tap", () => {
    for (const index of [0, 1]) {
      expect(questions[index]?.pictures).toBeUndefined();
      expect(questions[index]?.species).toBe("choose");
    }
    expect(questions[0]?.question).toContain("What minibeasts do you know");
    expect(questions[1]?.question).toContain("favourite minibeast");
  });

  it("answers why minibeasts matter with what they DO, not with creatures to name", () => {
    // Johan, 2026-09-13: three or four cards here, pollination, decomposing
    // and the like. Four cards: bee, woodlice, worm, ladybird.
    const why = questions[2];
    expect(why?.question).toBe("Why do you think minibeasts matter to our planet?");
    expect(why?.pictures?.purpose).toBe("example");
    expect(why?.pictures?.items.map((item) => item.src)).toEqual([
      "/lesson-examples/bee-pollen.webp",
      "/lesson-examples/woodlice.webp",
      "/lesson-examples/earthworm-soil.webp",
      "/lesson-examples/ladybird-aphids.webp",
    ]);
    // Every card says what the creature DOES, in a sentence a teacher can read out.
    for (const item of why?.pictures?.items ?? []) {
      expect(item.caption).toMatch(/^[A-Z].*\.$/);
      expect(item.caption).not.toContain("!");
    }
    expect(why?.species).toBeUndefined();
  });
});

describe("the component", () => {
  const set = (purpose: PictureSet["purpose"]): PictureSet => ({
    purpose,
    items: [{ src: "/lesson-examples/woodlice.webp", alt: "Woodlice in a log", caption: "Woodlice" }],
  });

  it("renders nothing for an absent or empty set", () => {
    expect(renderToStaticMarkup(<LessonPictures pictures={null} />)).toBe("");
    expect(
      renderToStaticMarkup(<LessonPictures pictures={{ purpose: "example", items: [] }} />)
    ).toBe("");
  });

  it("renders an example with its caption and a look-closer control", () => {
    const html = renderToStaticMarkup(<LessonPictures pictures={set("example")} />);
    expect(html).toContain("<figure");
    expect(html).toContain("woodlice.webp");
    expect(html).toContain("<button");
    expect(html).toContain("Look closer:");
  });

  it("renders a choose-from as buttons, because a child picks one", () => {
    const html = renderToStaticMarkup(<LessonPictures pictures={set("choose-from")} />);
    expect(html).toContain("<button");
    // Decorative inside a labelled button: the caption is the accessible name
    // already, and repeating it reads the same words twice.
    expect(html).toContain('alt=""');
  });
});

describe("the runner", () => {
  it("names no session id, which is the arrangement this ticket removes", () => {
    const runner = readFileSync(
      new URL("../../app/run/HybridJourney.tsx", import.meta.url),
      "utf8"
    );
    for (const id of ["animal-leaf-masks", "seed-searchers", "minibeast-hunting"]) {
      expect(runner, `HybridJourney names ${id}`).not.toContain(id);
    }
    expect(runner).not.toContain("hasMaskAnimals");
  });
});
