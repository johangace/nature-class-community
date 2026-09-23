import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
/**
 * The conditions note streams behind its own Suspense boundary (2026-09-08),
 * so rendering this page reaches `getTodayRead`. It is mocked to an empty
 * read rather than given a fixture: this file is about the page's own shape,
 * and a unit test may not depend on a third party's response time (nc#808).
 * The note's own behaviour is tested in session-page-conditions-note.spec.tsx.
 */
vi.mock("@/lib/outside/today", () => ({
  getTodayRead: vi.fn(async () => ({ conditions: [], read: null })),
}));

import { SessionModes } from "@/app/session/SessionModes";
import { OfflineLessonControl } from "@/app/run/OfflineLessonControl";
import { fieldHref } from "@/lib/offline/field-location";
import { projectLessonJourney } from "@/lib/lesson/journey";
import type { LessonHazards } from "@/lib/lesson/hazards";
import { findSession, loadAllPacks } from "@/lib/pack";

/**
 * THE PRE-READ SHOWS WHAT THE SESSION ALREADY SAYS.
 *
 * Johan, 2026-08-17, looking at the screen for "Counting life": *"this is very
 * poor.. we could have more info here... pre reading is soo poor.. no keywords
 * or anything also what you will need or prepign stuf? goals? safety?"*
 *
 * He was right and the cause was not missing content. Every one of those
 * things was authored and sitting on the session object, and the screen showed
 * a title, an objective, a duration and two links. Counted across the packs:
 *
 *   driving question   48 of 48 sessions
 *   primer             48 of 48
 *   key-word glossary  40 of 48, each with a child-friendly phrasing
 *   kit                44 of 48 non-empty
 *   space needed       44 of 48
 *
 * None of it reached the page. That is the same shape as the rest of this
 * repo: the data was there and nothing read it, so this guard is about REACH,
 * and it runs against the REAL packs rather than a fixture. A fixture would
 * have passed on the day the screen was empty.
 */

/** Markup with the handful of entities React escapes, put back. */
function decode(markup: string): string {
  return markup
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function intro(
  sessionId: string,
  options: {
    hazards?: LessonHazards | null;
    homeHref?: "/" | "/today";
    offlineAvailable?: boolean;
  } = {},
) {
  const found = findSession(sessionId);
  if (!found) throw new Error(`no session ${sessionId}`);
  return {
    session: found.session,
    markup: renderToStaticMarkup(
      <SessionModes
        activeClass={{ name: "Willow class", yearGroup: "Year 1" }}
        hazards={options.hazards ?? null}
        homeHref={options.homeHref}
        journey={projectLessonJourney(found.pack, found.session)}
        locale={undefined}
        media={[]}
        offlineAvailable={options.offlineAvailable ?? false}
        previewSeconds={null}
        session={found.session}
        todayQuery={{}}
        weekOf="week 1 of 4"
      />
    ),
  };
}

/** A session that needs no kit, which is the one Johan was looking at. */
const COUNTING = "summer-w1-counting-life";

describe("the pre-read brief", () => {
  it("keeps the full objective in the linked key-ideas read", () => {
    const { session, markup } = intro(COUNTING);
    expect(session.prompt).toBeTruthy();
    expect(markup).toContain(`/session/primer?session=${COUNTING}`);
    const primerSource = readFileSync(
      join(process.cwd(), "app/session/primer/PrimerPage.tsx"),
      "utf8"
    );
    expect(primerSource).toContain("journey.objective");
  });

  it("leads with what the children do, and spends no line on a label for it", () => {
    const { session, markup } = intro(COUNTING);
    const work = session.childWorkSummary ?? session.primer?.summary;
    expect(work).toBeTruthy();
    // The sentence still reaches the page — that is what this file guards.
    expect(decode(markup)).toContain(work!.slice(0, 40));
    // What changed in #342 is that it is no longer a row in a list. Johan:
    // "how monotone it is". A lead paragraph that has to be told what it is
    // is not leading, so the label is gone and the assertion inverts.
    expect(markup).not.toContain("What the children do");
  });

  it("leaves why it matters to the pre-reading, and the door still goes there", () => {
    const { session, markup } = intro(COUNTING);
    expect(session.primer?.why, "the fixture session must carry a why").toBeTruthy();
    // Johan: "the fields here are so redundant and can be found ... in the
    // pre read." This was the field that was ONLY in the pre-read, printed
    // twice.
    expect(markup).not.toContain("Why it matters");

    // A cut is only honest if the words still land somewhere a teacher can
    // reach in one tap, so the guard follows the door rather than trusting
    // the comment beside it: the link, then the page it opens, by source.
    expect(markup).toContain(`/session/primer?session=${COUNTING}`);
    const primerSource = readFileSync(
      join(process.cwd(), "app/session/primer/PrimerPage.tsx"),
      "utf8"
    );
    expect(primerSource).toContain("primer.why");
  });

  /*
   * THE GUARD THE LAST CUT SHOULD HAVE HAD. #342 removed the duration from
   * this screen because the running head printed it, and #325 then took it
   * out of the running head, so for one afternoon no surface in the journey
   * said how long the lesson was. The fact was true and the reasoning was
   * sound; what was missing was anything that would notice when it stopped
   * being true.
   */
  it("says how long the lesson is, on the screen where she decides to teach it", () => {
    const { session, markup } = intro(COUNTING);
    expect(session.durationMin).toBeGreaterThan(0);
    expect(markup).toContain(`${session.durationMin} min`);
  });

  it("answers what to bring even when the answer is nothing", () => {
    const { session, markup } = intro(COUNTING);
    // An empty kit is not a gap. This session says "Nothing to bring. Walk out
    // as you are." — a better answer than an absent row, and the old screen
    // hid the row entirely whenever the kit was empty.
    expect(session.kit).toHaveLength(0);
    expect(markup).toContain("What to bring");
    expect(decode(markup)).toContain(session.preparation!);
  });

  it("lists the kit when there is one", () => {
    const withKit = loadAllPacks()
      .flatMap((pack) => pack.sessions)
      .find((s) => s.kit.length > 0);
    expect(withKit, "no session in any pack has a kit").toBeTruthy();

    const markup = intro(withKit!.id).markup;
    for (const item of withKit!.kit) expect(decode(markup)).toContain(item);
  });

  /**
   * KEY WORDS ARE IN THE PRE-READING, AND NOWHERE ELSE (#409, #417).
   *
   * This test used to assert the opposite — that the definitions were printed
   * on this screen — and it was right to, for as long as nothing else held
   * them. Johan, 2026-08-24: *"the keywords in nature class should not be
   * there"*, and then, on the page #409 built them: *"key words can be part of
   * the pre read.. they can be section"*.
   *
   * So this asserts the cut only. The words landing safely is the primer's
   * guard to keep (pre-leading.spec.tsx), which is the right split: this file
   * owns what the brief does NOT say.
   */
  it("keeps the key words off the brief entirely", () => {
    const withWords = loadAllPacks()
      .flatMap((pack) => pack.sessions)
      .find((s) => (s.primer?.glossary?.length ?? 0) > 0);
    expect(withWords, "no session in any pack has a glossary").toBeTruthy();

    const markup = intro(withWords!.id).markup;
    const first = withWords!.primer!.glossary![0];
    if (!first) throw new Error("expected at least one glossary term");

    expect(markup).not.toContain("Key words");
    // The page #409 built and #417 deleted. Named explicitly so a revert that
    // brings the route back has to argue with a test rather than slip in.
    expect(markup).not.toContain("/session/words");
    // The meanings themselves. Sliced, because a whole definition may share a
    // stray clause with the objective; the first 40 characters of an authored
    // definition do not appear twice by accident.
    expect(decode(markup)).not.toContain(first.definition.slice(0, 40));
    if (first.forChildren) {
      expect(decode(markup)).not.toContain(first.forChildren.slice(0, 40));
    }

    // And the door that holds them says so, so the cut is not silent.
    expect(markup).toContain(`/session/primer?session=${withWords!.id}`);
    // Called Pre-reading since #870, the name the runner's own door and the
    // field sheet already use for this destination.
    expect(markup).toContain("Pre-reading");
  });

  /**
   * HAZARDS ARE A DOOR NOW (#417).
   *
   * Johan, looking at the band: *"why are they not in a hazards page. or safety
   * page"*. The band came off, and the one thing this move must not do is make
   * the hazards quiet — so the door has to carry the COUNT, not just the word
   * "safety". A teacher who has to open a page to learn there was anything to
   * open it for has been given less than she had.
   */
  it("sends the hazards to a page, with the count still on the brief", () => {
    const hazards: LessonHazards = {
      source: "starter",
      entries: [
        { id: "water", name: "Deep or moving water", note: "Set the boundary first." },
        { id: "ticks", name: "Ticks", note: "Trousers into socks going in." },
      ],
    };
    const markup = intro(COUNTING, { hazards }).markup;

    expect(markup).toContain(`/session/safety?session=${COUNTING}`);
    expect(markup).toContain(">Safety</a>");
    // The count and the reach, on the door.
    expect(markup).toContain("2 safety checks");
    // The notes themselves are on the page, not here.
    expect(decode(markup)).not.toContain("Set the boundary first.");
    expect(decode(markup)).not.toContain("Trousers into socks going in.");
  });

  it("keeps the safety page reachable when nothing resolved", () => {
    const markup = intro(COUNTING, { hazards: null }).markup;
    expect(markup).toContain(`/session/safety?session=${COUNTING}`);
    expect(markup).toContain(">Safety</a>");
    expect(markup).not.toContain("0 safety checks");
  });

  it("names the preparation tools directly", () => {
    const { markup } = intro(COUNTING);
    expect(markup).toContain("Pre-reading");
    expect(markup).toContain("Print");
    expect(markup).not.toContain("Conditions");
  });

  it("keeps one quiet offline control inside a released lesson", () => {
    const markup = intro(COUNTING, { offlineAvailable: true }).markup;

    expect(markup).toContain("Go offline");
    expect(markup.match(/aria-haspopup="dialog"/g)).toHaveLength(1);

    const readyControl = decode(
      renderToStaticMarkup(
        <OfflineLessonControl
          connectionState="online"
          initialReadiness="ready"
          sessionId={COUNTING}
        />,
      ),
    );
    expect(readyControl).toContain(">Go offline</button>");
    expect(readyControl).not.toContain("Available offline");
    expect(readyControl).toContain(fieldHref(COUNTING, "run"));

    for (const promotedOfflineCopy of [
      "Departure check",
      "Open-core shelf",
      "Live tools",
      "Prepare field version",
      "Field version",
      "Save details",
      "Prepared on this iPad",
    ]) {
      expect(markup).not.toContain(promotedOfflineCopy);
    }
  });

  it("carries the teacher return into the runner's offline door", () => {
    const modes = readFileSync(
      join(process.cwd(), "app/session/SessionModes.tsx"),
      "utf8",
    );
    const connection = readFileSync(
      join(process.cwd(), "app/session/LessonConnection.tsx"),
      "utf8",
    );

    expect(modes).toContain("homeHref={homeHref}");
    expect(connection).toContain("fieldPrintHref(sessionId, homeHref)");
    expect(connection).toMatch(/<OfflineLessonControl[\s\S]{0,180}homeHref=\{homeHref\}/);
  });

  it("does not offer the offline copy on an unreleased lesson", () => {
    const premium = findSession("garden-w1-autumn-detectives")?.session;
    expect(premium).toBeTruthy();

    const markup = intro(premium!.id, { offlineAvailable: false }).markup;
    expect(markup).not.toContain('aria-haspopup="dialog"');
    expect(markup).not.toContain(fieldHref(premium!.id, "run"));
  });
});
