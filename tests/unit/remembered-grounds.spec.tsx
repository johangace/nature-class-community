import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  composeRememberedFacts,
  type WorldFactRecord,
} from "@/lib/world-memory";
import { PHOTO_QUOTE } from "@/lib/ai/world-extract-contract";
import { RememberedGrounds } from "@/app/session/primer/RememberedGrounds";
import { PrimerPage } from "@/app/session/primer/PrimerPage";
import type { LessonViewProps } from "@/app/session/PlanPageFrame";

/**
 * THE MERGED INTAKE STOPS BEING INVISIBLE (#509).
 *
 * #360 and #377 shipped a teacher telling the assistant about her grounds and
 * confirming what it read back. Nothing she prepares from has quoted a word of
 * it since. These are assertions about the strip she actually receives — the
 * markup, not the shape of the data behind it — because the failure this
 * ticket exists to end is a feature that is correct and reaches nobody.
 *
 * The composition tests come first and carry the rules; the render tests carry
 * the two claims a teacher can see: her sentence is quoted verbatim, and a
 * fact we worked out is never dressed as one she stated.
 */

const stated = (over: Partial<WorldFactRecord> = {}): WorldFactRecord => ({
  kind: "note",
  value: "a shallow pond behind the sheds",
  sourceText: "there's a shallow pond behind the sheds",
  provenance: "teacher-stated",
  decidedAt: new Date("2026-08-12T09:00:00Z"),
  extractedAt: new Date("2026-08-12T08:59:00Z"),
  ...over,
});

const EMPTY = { siteFeatures: [], siteNotes: [], reach: null };

/** The one row a case is about. Fails loudly rather than reading undefined. */
function only(facts: ReturnType<typeof composeRememberedFacts>) {
  expect(facts).toHaveLength(1);
  return facts[0]!;
}

describe("what we remember, composed", () => {
  it("is empty when she has told us nothing, so the surface can render nothing", () => {
    expect(composeRememberedFacts(EMPTY, [])).toEqual([]);
    // A ledger with history but a world she has since emptied is still empty:
    // the strip reads the live columns, never the ledger's own memory of them.
    expect(composeRememberedFacts(EMPTY, [stated()])).toEqual([]);
  });

  it("quotes her own sentence for a fact the ledger carries", () => {
    const fact = only(
      composeRememberedFacts({ ...EMPTY, siteNotes: ["a shallow pond behind the sheds"] }, [
        stated(),
      ])
    );

    expect(fact.quote).toBe("there's a shallow pond behind the sheds");
    expect(fact.provenance).toBe("teacher-stated");
    expect(fact.source).toBe("Your words, 12 August.");
    expect(fact.retireLabel).toBe("Not any more");
  });

  it("keeps a photographed fact in its own register", () => {
    const fact = only(
      composeRememberedFacts({ ...EMPTY, siteFeatures: ["a log pile"] }, [
        stated({
          kind: "feature",
          value: "a log pile",
          // What production actually stores for a photographed fact.
          sourceText: PHOTO_QUOTE,
          provenance: "teacher-photographed",
          decidedAt: new Date("2026-09-03T10:00:00Z"),
        }),
      ])
    );

    expect(fact.provenance).toBe("teacher-photographed");
    expect(fact.source).toBe("From your photograph, 3 September.");
    // Still hers. A photograph she took is testimony, not a derivation.
    expect(fact.retireLabel).toBe("Not any more");
    // And NOT quoted. `sourceText` on a photographed row is the sentinel
    // PHOTO_QUOTE, so quoting it put `You told us: "from your photograph"` on
    // the page and gave every photographed row the same accessible name.
    expect(fact.quote).toBeNull();
    expect(fact.line).toBe("In your grounds: a log pile.");
  });

  it("labels a fact we worked out apart from one she stated", () => {
    const fact = only(
      composeRememberedFacts({ ...EMPTY, siteFeatures: ["a pond"] }, [
        stated({
          kind: "feature",
          value: "a pond",
          sourceText: "a pond",
          provenance: "map-derived",
          decidedAt: new Date("2026-09-01T10:00:00Z"),
        }),
      ])
    );

    expect(fact.provenance).toBe("derived");
    expect(fact.source).toBe("Worked out for you, 1 September.");
    expect(fact.retireLabel).toBe("Not quite right");
    // A fact we worked out is never presented as something she said.
    expect(fact.quote).toBeNull();
  });

  it("treats a fact with no ledger row as hers, unquoted — she tapped it", () => {
    const fact = only(composeRememberedFacts({ ...EMPTY, siteFeatures: ["a bug hotel"] }, []));

    expect(fact.quote).toBeNull();
    expect(fact.provenance).toBe("teacher-stated");
    expect(fact.line).toBe("In your grounds: a bug hotel.");
    expect(fact.source).toBe("Your answer, from setting up your grounds.");
    expect(fact.retireLabel).toBe("Not any more");
  });

  it("quotes the sentence she said most recently when she said it twice", () => {
    const fact = only(
      composeRememberedFacts({ ...EMPTY, siteNotes: ["a shallow pond behind the sheds"] }, [
        stated({ sourceText: "first telling", decidedAt: new Date("2026-08-12T09:00:00Z") }),
        stated({ sourceText: "second telling", decidedAt: new Date("2026-09-02T09:00:00Z") }),
      ])
    );

    expect(fact.quote).toBe("second telling");
    expect(fact.source).toBe("Your words, 2 September.");
  });

  it("is written in her own English, and never edits her sentence", () => {
    const facts = composeRememberedFacts(
      {
        siteFeatures: ["a log pile"],
        siteNotes: ["the wild corner by the school grounds"],
        reach: "grounds",
      },
      [stated({ value: "the wild corner by the school grounds" })],
      "us"
    );
    const [note, feature, reach] = facts;

    // Our words become hers: "grounds" is the term #872 found a US teacher
    // reading as British, and this surface must not put it back.
    expect(feature?.line).toBe("In your schoolyard: a log pile.");
    expect(reach?.line).toBe("How far you can get: Our own schoolyard.");
    expect(feature?.source).toBe("Your answer, from setting up your schoolyard.");
    // Hers stay hers, both the note and the quotation.
    expect(note?.line).toBe("the wild corner by the school grounds");
    expect(note?.quote).toBe("there's a shallow pond behind the sheds");
    // And the date reads the way she writes one.
    expect(note?.source).toBe("Your words, August 12.");
  });

  it("reads reach back in the words she was offered, not its stored id", () => {
    const fact = only(composeRememberedFacts({ ...EMPTY, reach: "hard-surface" }, []));

    expect(fact.kind).toBe("reach");
    expect(fact.value).toBe("hard-surface");
    expect(fact.line).toBe("How far you can get: Hard surface only.");
  });
});

describe("the strip a teacher receives", () => {
  it("renders her sentence, where it came from, and a way to retire it", () => {
    const facts = composeRememberedFacts(
      {
        siteNotes: ["a shallow pond behind the sheds"],
        siteFeatures: ["a bug hotel"],
        reach: "grounds",
      },
      [stated()]
    );
    const html = renderToStaticMarkup(
      <RememberedGrounds classId="willow" facts={facts} sessionId="demo" locale="uk" />
    );

    expect(html).toContain("What we remember about your grounds");
    expect(html).toContain("You told us:");
    expect(html).toContain("there&#x27;s a shallow pond behind the sheds");
    expect(html).toContain("Your words, 12 August.");
    expect(html).toContain("In your grounds: a bug hotel.");
    expect(html).toContain("How far you can get: Our own grounds.");
    // One control per fact, each naming the fact it would retire, because
    // three buttons all reading "Not any more" name nothing to a screen reader.
    const labels = html.match(/aria-label="[^"]+"/g) ?? [];
    expect(labels.length).toBe(3);
    expect(new Set(labels).size).toBe(3);
    expect(labels).toContain(
      'aria-label="Not any more: there&#x27;s a shallow pond behind the sheds"'
    );
  });

  it("posts each retire as a plain form, not through the client router", () => {
    // The fix for #509's half-landing control, pinned. Three server-action
    // versions left the retired fact on screen with the write committed; a
    // form post does not depend on hydration and lands every time. See
    // app/api/world-memory/retire/route.ts.
    const facts = composeRememberedFacts({ ...EMPTY, siteFeatures: ["a log pile"] }, []);
    const html = renderToStaticMarkup(
      <RememberedGrounds classId="willow" facts={facts} sessionId="autumn-w1" locale="uk" />
    );

    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/world-memory/retire"');
    expect(html).toContain('name="classId" value="willow"');
    expect(html).toContain('name="kind" value="feature"');
    expect(html).toContain('name="value" value="a log pile"');
    expect(html).toContain('name="sessionId" value="autumn-w1"');
    expect(html).toContain('name="locale" value="uk"');
  });

  it("says so when the last retire did not write, and keeps the fact", () => {
    const facts = composeRememberedFacts({ ...EMPTY, siteFeatures: ["a log pile"] }, []);
    const html = renderToStaticMarkup(
      <RememberedGrounds
        classId="willow"
        facts={facts}
        sessionId="demo"
        locale="uk"
        retireFailed
      />
    );

    expect(html).toContain("That did not save.");
    expect(html).toContain("In your grounds: a log pile.");
  });

  it("renders nothing at all when there is nothing remembered", () => {
    expect(renderToStaticMarkup(<RememberedGrounds classId="willow" facts={[]} sessionId="demo" locale="uk" />)).toBe("");
  });

  it("stays off the primer for a teacher who has told us nothing", () => {
    const html = renderToStaticMarkup(<PrimerPage {...primerProps({})} />);

    expect(html).not.toContain("What we remember about your grounds");
  });

  it("leads the primer, above the lesson's own sections, when there is something", () => {
    const facts = composeRememberedFacts(
      { ...EMPTY, siteNotes: ["a shallow pond behind the sheds"] },
      [stated()]
    );
    const html = renderToStaticMarkup(
      <PrimerPage {...primerProps({ activeClassId: "willow", remembered: facts })} />
    );

    expect(html).toContain("What we remember about your grounds");
    expect(html.indexOf("What we remember about your grounds")).toBeLessThan(
      html.indexOf("Learning objective")
    );
  });
});

function primerProps(over: Partial<LessonViewProps>): LessonViewProps {
  return {
    journey: {
      title: "Counting life",
      objective: "Notice everything that is alive around you.",
      route: [{ key: "count", title: "Count", durationMinutes: 5 }],
    },
    weekOf: "one lesson",
    session: { id: "demo", title: "Counting life", phases: [] },
    activeClass: null,
    locale: "uk",
    ...over,
  } as unknown as LessonViewProps;
}
