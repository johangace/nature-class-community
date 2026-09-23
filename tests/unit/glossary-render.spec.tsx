import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlossaryProvider, GlossedNote, GlossedText } from "@/app/run/Glossary";
import { TeacherNoteBlock } from "@/engine/renderers/teacher-note";
import { SayAloudBlock } from "@/engine/renderers/say-aloud";
import type { PrimerTerm } from "@/schema/pack";

/**
 * The mark on the page, not just the matcher behind it (#350).
 *
 * The matcher's own tests all passed while the feature reached nobody, so this
 * renders the real renderers through the real provider and looks at the markup
 * a teacher would receive.
 */

const TERMS: PrimerTerm[] = [
  {
    term: "Deciduous",
    definition: "A tree that drops all its leaves in autumn and grows new ones in spring.",
    forChildren: "Deciduous trees let all their leaves fall in autumn.",
  },
  { term: "Bud", definition: "A tight package on a twig holding next year's leaf." },
  { term: "Trunk", definition: "The thick main stem of a tree." },
];

const note = (text: string) => ({ type: "teacher-note" as const, text });

function render(terms: PrimerTerm[] | undefined, text: string) {
  return renderToStaticMarkup(
    <GlossaryProvider terms={terms}>
      <TeacherNoteBlock block={note(text)} ability="y2" />
    </GlossaryProvider>
  );
}

describe("the word on the page", () => {
  it("marks an authored term inside the teacher's own line", () => {
    const html = render(TERMS, "Point at a deciduous tree and let them look.");
    expect(html).toContain("gloss-word");
    expect(html).toMatch(/aria-expanded="false"/);
    // The sentence still reads as written, in its own case.
    expect(html).toContain("deciduous");
  });

  it("marks the plural of a singular term", () => {
    const html = render(TERMS, "Find three buds on one twig.");
    expect(html).toContain("gloss-word");
    expect(html).toContain("buds");
  });

  it("leaves the line untouched when the session has no glossary", () => {
    const plain = render(undefined, "Point at a deciduous tree and let them look.");
    expect(plain).not.toContain("gloss-word");
    expect(plain).toContain("Point at a deciduous tree and let them look.");
  });

  it("leaves the line untouched when nothing in it is a term", () => {
    const plain = render(TERMS, "Give them a moment before you ask anything.");
    expect(plain).not.toContain("gloss-word");
  });

  it("never marks a term hiding inside a longer word", () => {
    // The footnote-under-"buddy" failure, on the real renderer.
    const html = render(TERMS, "She sat with her buddy on the log.");
    expect(html).not.toContain("gloss-word");
  });

  it("keeps the words she speaks aloud unmarked", () => {
    // The say-aloud block wears no mark of its own by design, and a tappable
    // word mid-sentence is an interruption aimed at the wrong moment.
    const html = renderToStaticMarkup(
      <GlossaryProvider terms={TERMS}>
        <SayAloudBlock
          block={{ type: "say-aloud", text: "Look up at the deciduous tree." }}
          ability="y2"
        />
      </GlossaryProvider>
    );
    expect(html).not.toContain("gloss-word");
    expect(html).toContain("Look up at the deciduous tree.");
  });

  it("carries no box, fill or card in the reveal's markup", () => {
    // The lesson is one book page. If this ever grows a card, #231 gets undone
    // one component at a time.
    const glossary = readSource("app/run/Glossary.tsx");
    expect(glossary).not.toMatch(/role="dialog"|createPortal|position:\s*fixed/);
    const css = readSource("app/globals.css");
    const block = css.slice(css.indexOf(".gloss-open {"), css.indexOf(".gloss-term"));
    expect(block).not.toMatch(/background|box-shadow|border-radius/);
  });

  it("sets no colour on the reveal, so the runner's outdoor mode stays readable", () => {
    /*
     * Caught on screen, not in code: styled with --ink-2 and --ink-3, the
     * reveal came out near-black on near-black in the runner's dark outdoor
     * mode. That theme is a CSS-module class globals.css cannot name, so the
     * only safe answer is to inherit and lean on opacity.
     */
    const css = readSource("app/globals.css");
    const block = css.slice(css.indexOf(".gloss-open {"), css.indexOf("/* The caption inherits"));
    expect(block).not.toMatch(/--ink|--slate|--caption|#[0-9a-f]{3,6}|\brgb\(/i);
    expect(block).toMatch(/opacity/);
  });

  it("sets the meaning out under the paragraph, never inside the sentence", () => {
    /*
     * The failure this replaced, live on the runner: "Nests, branches, the
     * shape of trunks" — meaning — ", buildings behind trees, the sky itself."
     * She had to read around a hole in her own line.
     */
    const html = renderToStaticMarkup(
      <GlossaryProvider terms={TERMS}>
        <OpenedNote />
      </GlossaryProvider>
    );
    // The reveal is a sibling after the paragraph, not a child of it.
    expect(html).not.toMatch(/<p[^>]*>[\s\S]*gloss-open/);
  });
});

/** A note whose word is already open, without a browser to click in. */
function OpenedNote() {
  return (
    <GlossedNote className="teacher-note-text">
      <GlossedText>Point at the trunks and let them look.</GlossedText>
    </GlossedNote>
  );
}

function readSource(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync(require("node:path").resolve(process.cwd(), path), "utf8");
}
