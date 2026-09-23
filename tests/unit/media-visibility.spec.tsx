import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getSession, loadPack } from "@/lib/pack";
import {
  fieldMediaPhaseIndex,
  shouldShowDoorEvidence,
  shouldShowFieldMedia,
  showsFieldMedia,
} from "@/lib/lesson/media-visibility";
import { IntroduceLook, type LessonCast } from "@/app/run/HybridJourney";
import type { CastMember } from "@/lib/cast/member";
import type { LessonMediaItem } from "@/lib/lesson/media";

/**
 * nc#403 — Counting Life primed an open survey with expected species on
 * every moment. `HybridJourney` resolved one media set for the whole session
 * and mounted it unconditionally under every phase, so the same three
 * candidate photographs sat under "count everything that's alive within ten
 * steps" — naming likely answers before the children had looked.
 *
 * `shouldShowFieldMedia` is the fix: one pure, authored, per-phase decision
 * at the runner boundary. These tests prove the decision key is lesson
 * purpose + phase, never merely whether there is media to show.
 *
 * The function only reads `items.length` (it never looks at what a photo
 * IS), so a plain three-element array stands in for the session's resolved
 * `LessonMediaItem[]` here — identical across every assertion below, so the
 * only thing that ever changes is the phase.
 */
const media = [{}, {}, {}];

describe("shouldShowFieldMedia", () => {
  it("withholds media from an open-count phase even with non-empty media", () => {
    expect(shouldShowFieldMedia({ materialPurpose: "open-count" }, media)).toBe(false);
  });

  it("shows the SAME non-empty media set on an ordinary (recognition) phase", () => {
    // The decisive proof: identical `media`, only `materialPurpose` differs,
    // and the outcome flips. Visibility is decided by lesson purpose, not by
    // whether items exist.
    expect(shouldShowFieldMedia({ materialPurpose: undefined }, media)).toBe(true);
  });

  it("still withholds an open-count phase with nothing to show, for the boring reason (no items)", () => {
    expect(shouldShowFieldMedia({ materialPurpose: "open-count" }, [])).toBe(false);
  });

  it("withholds nothing regardless of purpose when there is nothing to show", () => {
    expect(shouldShowFieldMedia({ materialPurpose: undefined }, [])).toBe(false);
  });
});

describe("shouldShowFieldMedia against real pack data", () => {
  const pack = loadPack("summer");

  it("Counting Life: no candidate species before or during the count — every body phase is open-count", () => {
    const session = getSession(pack, "summer-w1-counting-life");
    const bodyPhases = session.phases.filter((phase) =>
      phase.blocks.every((block) => block.type !== "circle-question")
    );
    expect(bodyPhases.length).toBeGreaterThan(0);
    for (const phase of bodyPhases) {
      expect(
        shouldShowFieldMedia(phase, media),
        `phase "${phase.key}" (${phase.title}) should withhold field media`
      ).toBe(false);
    }
  });

  it("a recognition lesson (Minibeast hunting) still shows its purpose-matched references", () => {
    const session = getSession(pack, "summer-w2-minibeast-hunting");
    const identify = session.phases.find((phase) => phase.key === "identify-3");
    expect(identify, "fixture session must still carry its Identify phase").toBeTruthy();
    // Nobody has re-authored this lesson's phases with `materialPurpose`, so
    // it keeps the runner's existing behaviour: the topic-matched reference
    // set may show.
    expect(identify!.materialPurpose).toBeUndefined();
    expect(shouldShowFieldMedia(identify!, media)).toBe(true);
  });
});

/**
 * #1019 — THE STRIP STOPPED BEING WALLPAPER.
 *
 * `shouldShowFieldMedia` is a veto, so a session with no `materialPurpose`
 * authored anywhere — every session in the catalogue but the two re-authored
 * for nc#403 — mounted the same three thumbnails under every screen it has.
 * Johan, 2026-09-06, from live screenshots of the leaf-mask lesson: one
 * identical strip on Collect, on Sort 1 of 3 and on Sort 2 of 3.
 *
 * `showsFieldMedia` keeps the veto and adds the choice: the strip renders on
 * the FIRST phase the veto lets through, which is the moment a class is about
 * to go and look, and nowhere else.
 */
describe("showsFieldMedia: once, where a class goes and looks", () => {
  const work = [{ mode: "work" as const }, { mode: "work" as const }, { mode: "work" as const }];

  it("shows on the first phase and on no later one", () => {
    expect(showsFieldMedia(work, 0, media)).toBe(true);
    expect(showsFieldMedia(work, 1, media)).toBe(false);
    expect(showsFieldMedia(work, 2, media)).toBe(false);
  });

  it("passes over a gather phase: reflection is not going to look", () => {
    const phases = [{ mode: "gather" as const }, { mode: "work" as const }];
    expect(fieldMediaPhaseIndex(phases)).toBe(1);
    expect(showsFieldMedia(phases, 0, media)).toBe(false);
    expect(showsFieldMedia(phases, 1, media)).toBe(true);
  });

  it("passes over an open-count phase and keeps nc#403's veto", () => {
    const phases = [{ materialPurpose: "open-count" as const }, { mode: "work" as const }];
    expect(showsFieldMedia(phases, 0, media)).toBe(false);
    expect(showsFieldMedia(phases, 1, media)).toBe(true);
  });

  it("shows nothing anywhere when every phase is vetoed", () => {
    const phases = [{ materialPurpose: "open-count" as const }, { mode: "gather" as const }];
    expect(fieldMediaPhaseIndex(phases)).toBeNull();
    expect(showsFieldMedia(phases, 0, media)).toBe(false);
    expect(showsFieldMedia(phases, 1, media)).toBe(false);
  });

  it("shows nothing when there is nothing to show", () => {
    expect(showsFieldMedia(work, 0, [])).toBe(false);
  });

  it("shows nothing for a phase index that is not in the session", () => {
    expect(showsFieldMedia(work, 9, media)).toBe(false);
  });
});

describe("showsFieldMedia against the lesson Johan photographed", () => {
  const pack = loadPack("autumn-starter");

  it("Animal leaf masks: the strip is on Collect, and not on Introduce, Sort, Create or Show and tell", () => {
    const session = getSession(pack, "animal-leaf-masks");
    // The runner's own body list: the authored settle is lifted out into the
    // settle ritual and the circle phase into Circle time, so neither is a
    // step in the walk this function indexes (`HybridJourney`, `bodyPhases`).
    const settle = session.phases.find((phase) => phase.key === "settle");
    const circle = session.phases.find((phase) =>
      phase.blocks.some((block) => block.type === "circle-question")
    );
    const phases = session.phases.filter((phase) => phase !== settle && phase !== circle);
    expect(phases.map((phase) => phase.key)).toEqual(["introduce", "collect", "sort", "create", "show-tell"]);

    // Take outside is where a child is about to go and look. Introduce is the
    // board, indoors, before anyone has gone anywhere.
    expect(showsFieldMedia(phases, 0, media)).toBe(false);
    expect(showsFieldMedia(phases, 1, media)).toBe(true);
  });
});

/**
 * nc#403, REOPENED 2026-08-31 — the body-phase guard above was not the whole
 * fix. `IntroduceLook`, the door screen every session opens on BEFORE any
 * phase is on the screen, resolves its own evidence (`resolveDoor`) and
 * mounted it unconditionally. Live regression check on 25 Aug: Counting
 * Life's door still showed three candidate species (Common Starling,
 * Eurasian Magpie, Great Crested Grebe) directly above "What's living in our
 * grounds?" — the same priming, reached through a surface the phase-level
 * guard never covered.
 *
 * `shouldShowDoorEvidence` is that second gate: since the door has no phase
 * of its own to key off, it asks whether the session opens on ANY open-count
 * phase at all.
 */
describe("shouldShowDoorEvidence", () => {
  it("withholds the door when any phase in the session is open-count", () => {
    expect(
      shouldShowDoorEvidence({
        phases: [{ materialPurpose: undefined }, { materialPurpose: "open-count" }],
      })
    ).toBe(false);
  });

  it("shows the door when no phase is open-count", () => {
    expect(
      shouldShowDoorEvidence({
        phases: [{ materialPurpose: undefined }, { materialPurpose: undefined }],
      })
    ).toBe(true);
  });

  it("shows the door for a session with no phases marked at all", () => {
    expect(shouldShowDoorEvidence({ phases: [] })).toBe(true);
  });
});

describe("shouldShowDoorEvidence against real pack data", () => {
  const pack = loadPack("summer");

  it("Counting Life opens on no candidate species at all", () => {
    const session = getSession(pack, "summer-w1-counting-life");
    expect(shouldShowDoorEvidence(session)).toBe(false);
  });

  it("a recognition lesson (Minibeast hunting) still opens on its evidence", () => {
    const session = getSession(pack, "summer-w2-minibeast-hunting");
    expect(shouldShowDoorEvidence(session)).toBe(true);
  });
});

/**
 * THE RENDER-LEVEL PROOF. The pure function above could be right and the
 * wiring into `IntroduceLook` could still be wrong — this renders the real
 * component with a full, located, photographed cast (the strongest state the
 * door ever reaches) over both real sessions, so a regression that skips
 * calling `shouldShowDoorEvidence` at all turns this red.
 */
describe("IntroduceLook: the door obeys the same purpose gate as the phases (nc#403)", () => {
  const pack = loadPack("summer");

  function photographed(over: Partial<CastMember> = {}): CastMember {
    return {
      commonName: "Marmalade Hoverfly",
      scientificName: "Episyrphus balteatus",
      photoUrl: "https://inat.example/a.jpg",
      photoRole: "observation",
      iconicTaxon: "Insecta",
      honestyTier: "recorded",
      lastSeenWindow: null,
      yearsObserved: null,
      historicalAvgCount: null,
      safetyNote: null,
      sortRank: 0,
      absent: false,
      line: "",
      ...over,
    } as CastMember;
  }

  // Insecta on every member, so this one cast clears Minibeast hunting's
  // `primaryTopic` narrowing (`["Insecta", "Arachnida", "Mollusca"]` — see
  // `lib/outside/observations.ts`) and proves its evidence is untouched.
  // Counting Life carries no `primaryTopic` at all (it counts everything
  // alive on purpose), so the filter never applies there either — this is
  // exactly as strong a door as the live regression met, which showed
  // Common Starling, Eurasian Magpie and Great Crested Grebe (#403 reopened,
  // comment 2026-08-31): different species, the same shape of cast.
  const FULL_CAST: LessonCast = {
    members: [
      photographed({ commonName: "Marmalade Hoverfly", sortRank: 0 }),
      photographed({ commonName: "Red Admiral", sortRank: 1 }),
      photographed({ commonName: "Common Woodlouse", sortRank: 2 }),
    ],
    lines: [],
    located: true,
    placeName: "Canonbury",
  };

  const LESSON_MEDIA: LessonMediaItem[] = [
    {
      id: "hoverfly",
      name: "Marmalade Hoverfly",
      scientificName: "Episyrphus balteatus",
      kind: "reference",
      radiusKm: null,
      observedAt: null,
      sourceUrl: "https://example.test/hoverfly",
      photo: {
        url: "https://example.test/hoverfly.jpg",
        role: "taxon-reference",
        attribution: "Example",
        license: "cc-by",
        sourceUrl: "https://example.test/hoverfly",
      },
    },
  ];

  it("shows no candidate species on Counting Life's door, even with a full cast", () => {
    const session = getSession(pack, "summer-w1-counting-life");
    const markup = renderToStaticMarkup(<IntroduceLook cast={FULL_CAST} session={session} />);
    expect(markup).not.toContain("Marmalade Hoverfly");
    expect(markup).not.toContain("Red Admiral");
    expect(markup).not.toContain("Common Woodlouse");
    expect(markup).not.toContain("Usually around");
    expect(markup).not.toContain("Seen near");
  });

  it("shows the recognition lesson's tiered door cards, and the media list only when the door is empty", () => {
    // 2026-09-06 (Sophia, third pass): the pack's media list used to REPLACE
    // the door whenever a lesson carried one, so house-picked photos wearing
    // no tier displaced real recorded sightings. The cards lead; the list
    // stands in only when nothing honest cleared the door.
    const session = getSession(pack, "summer-w2-minibeast-hunting");
    const withCast = renderToStaticMarkup(
      <IntroduceLook cast={FULL_CAST} media={LESSON_MEDIA} session={session} />
    );
    expect(withCast).toContain("Red Admiral");
    expect(withCast).not.toContain("hoverfly.jpg");
    const noCast = renderToStaticMarkup(
      <IntroduceLook cast={null} media={LESSON_MEDIA} session={session} />
    );
    expect(noCast).toContain("Marmalade Hoverfly");
    expect(noCast).toContain("hoverfly.jpg");
    expect(noCast).not.toContain("Red Admiral");
  });

  it("does not bypass the open-count gate through the media fallback", () => {
    const session = getSession(pack, "summer-w1-counting-life");
    const markup = renderToStaticMarkup(
      <IntroduceLook cast={FULL_CAST} media={LESSON_MEDIA} session={session} />
    );

    expect(markup).not.toContain("Marmalade Hoverfly");
    expect(markup).not.toContain("hoverfly.jpg");
  });
});
