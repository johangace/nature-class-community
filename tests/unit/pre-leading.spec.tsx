import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanView } from "@/app/session/PlanView";
import { PrimerPage } from "@/app/session/primer/PrimerPage";
import { projectLessonJourney } from "@/lib/lesson/journey";
import { loadPack } from "@/lib/pack";

/**
 * The pre-leading architecture: three surfaces split by READ, not by content
 * type (nc#232).
 *
 *   the doorway   ten seconds, standing, deciding whether today works
 *   the paper     one tap, one choice
 *   the primer    ten minutes, seated, the night before
 *
 * This supersedes the one-scroll spec that used to live here. That design put
 * everything on one page, which conflated two reads with different postures:
 * it taxed the doorway with the primer's weight and demoted background
 * knowledge to a fold, which for background knowledge means unread. Johan:
 * "first screen when u enter is minimalist jsust few lines + larning
 * objectives ... Read Primer with keyowrds goals, structure long in a page
 * separate". It amends ruling R1.2 rather than reverting to the five-page rail,
 * because the split is by read and not by content type.
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
const journey = projectLessonJourney(autumn, leaf);
const shared = {
  journey,
  weekOf: "week 1 of 4",
  session: leaf,
  activeClass: { name: "Willow class", yearGroup: "Year 1" },
  locale: undefined,
};

const doorway = renderToStaticMarkup(createElement(PlanView, shared));
const primer = renderToStaticMarkup(createElement(PrimerPage, shared));

describe("the doorway is a ten-second read", () => {
  it("carries what can cancel a lesson at the door, and nothing more", () => {
    expect(doorway).toContain(journey.childWork.summary);
    expect(doorway).toContain(journey.objective);
    expect(doorway).toContain(`${journey.durationMinutes} min`);
  });

  it("stays under a hundred and fifty words", () => {
    // The rejected build held 82 words in its FIRST VIEWPORT alone. This is a
    // ceiling on the whole page, so the doorway cannot quietly reaccumulate.
    const words = doorway
      .replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    expect(words).toBeLessThan(150);
  });

  it("hides nothing behind a fold", () => {
    // Folds are how the primer got demoted in the first place.
    expect(doorway).not.toContain("<details");
  });

  it("offers exactly one threshold, and it is the only green surface", () => {
    expect(doorway.match(/class="btn-start"/g)).toHaveLength(1);
    expect(doorway).toContain(`/run?session=${leaf.id}`);
  });

  it("has no step rail and no page-turn links", () => {
    expect(doorway).not.toContain("plan-steps");
    expect(doorway).not.toContain("plan-page-nav");
    expect(doorway).not.toContain("Read the primer →");
  });

  it("sends a teacher to the primer and the paper as their own reads", () => {
    expect(doorway).toContain(`/session/primer?session=${leaf.id}`);
    expect(doorway).toContain(`/print?session=${leaf.id}`);
  });
});

describe("the doorway does not lead with adult objective prose", () => {
  it("shows the lesson title when no driving question was authored", () => {
    // 40 of 48 sessions have no authored question, and five of the eight that
    // do are declarative or the title with a full stop (nc#239). A generated
    // question would misrepresent whose words they are.
    if (journey.questionSource === "prompt") {
      expect(doorway).toContain(`<h1 class="plan-question">${journey.question}</h1>`);
      return;
    }
    expect(doorway).toContain(`<h1 class="plan-question">${journey.title}</h1>`);
    expect(doorway).not.toContain(`<h1 class="plan-question">${leaf.objective}</h1>`);
  });
});

describe("the primer is context, not a second script", () => {
  it("carries the teacher's background", () => {
    expect(primer).toContain(journey.objective);
    if (leaf.primer?.summary) expect(primer).toContain(leaf.primer.summary);
  });

  it("names the words to have ready from the authored glossary", () => {
    for (const term of leaf.primer?.glossary ?? []) {
      expect(primer).toContain(term.term);
      // Apostrophes arrive HTML-escaped from renderToStaticMarkup.
      expect(primer).toContain(term.definition.replaceAll("'", "&#x27;"));
    }
  });

  /**
   * THE PHRASING COMES WITH THEM (#409).
   *
   * Johan: *"also key words go into the pre-reading"*. This page already had
   * the terms and their meanings; what it dropped was `forChildren`, the
   * sentence she actually says to a seven-year-old. That was defensible while
   * the runner's brief printed it — it no longer does, so an authored line was
   * about to reach no surface a teacher reads before the lesson.
   *
   * The spoken lines this page still refuses are the SCRIPT
   * (`childFriendlyExamples`, guarded below). A word's phrasing is not script;
   * it is what the word means, said out loud.
   */
  it("brings the phrasing she says to a child along with the meaning", () => {
    const spoken = (leaf.primer?.glossary ?? []).filter((term) => term.forChildren);
    expect(spoken.length, "the fixture must carry a child-facing phrasing").toBeGreaterThan(0);
    for (const term of spoken) {
      const line = term.forChildren!.replaceAll('"', "").replaceAll("'", "&#x27;");
      expect(primer).toContain(line);
    }
  });

  it("shows the shape of the hour WITHOUT the spoken lines", () => {
    // Johan: "it should not be as much bold and what to say, more to give the
    // teacher context ... the runner is for what to say." Part names and
    // minutes belong here; the words she says have exactly one home, and
    // duplicating them would create two sources for one sentence.
    for (const phase of leaf.phases) {
      expect(primer).toContain(phase.title.replaceAll("&", "&amp;"));
    }
    for (const phase of leaf.phases) {
      for (const block of phase.blocks) {
        if (block.type !== "say-aloud") continue;
        expect(primer).not.toContain(block.text.slice(0, 40));
      }
    }
    // childFriendlyExamples holds spoken lines despite its name, so it must
    // not appear here either. This is the assertion that caught it.
    for (const example of leaf.primer?.childFriendlyExamples ?? []) {
      expect(primer).not.toContain(example.slice(0, 40));
    }
  });

  it("carries no quotation glyphs, because nothing here is said aloud", () => {
    expect(primer).not.toContain("quote-glyph");
    expect(primer).not.toContain("say-aloud-text");
  });
});
