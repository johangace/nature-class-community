"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { PrimerTerm } from "@/schema/pack";
import { markTerms } from "@/lib/glossary";
import { spokenLine } from "@/lib/text";

/**
 * A glossary word, live in the runner (#350).
 *
 * ── IT IS NOT A CARD, AND THAT WAS A DECISION ──────────────────────────────
 *
 * Johan asked for "an explanation card or somehting". The standing ruling on
 * these surfaces is the opposite of a card: the lesson is one book page, no
 * boxes, no fills, no trays, and #231 spent a whole pass stripping them. A
 * panel floating over the runner would be the first tray back on the surface
 * we just cleared, and it would cover the words underneath it in the one
 * moment she is reading them.
 *
 * So it opens like a footnote. The word carries a dashed rule, and tapping sets
 * the meaning out UNDER THE WHOLE PARAGRAPH.
 *
 * ── UNDER THE PARAGRAPH, NOT INSIDE THE SENTENCE ───────────────────────────
 *
 * The first build put the reveal inline where the word was, and on screen it
 * cut the sentence in half: "Nests, branches, the shape of trunks" — meaning —
 * ", buildings behind trees, the sky itself." She had to read around a hole in
 * her own line, mid-lesson. (It was also a block element inside a `<p>`, which
 * is invalid HTML the browser silently repairs.)
 *
 * That is why the paragraph owns the open term rather than each word owning its
 * own: `GlossedNote` renders the paragraph, holds which term is open, and sets
 * the meaning out after the closing full stop. One open at a time, because two
 * footnotes at once is a paragraph she has lost her place in.
 *
 * ── COLOUR IS INHERITED, NEVER TOKENISED ───────────────────────────────────
 *
 * Caught on screen too. The first pass styled this with `--ink-2` and
 * `--ink-3`, and in the runner's OUTDOOR mode — dark ground, pale ink — the
 * reveal came out near-black on near-black and could not be read at all. The
 * outdoor theme is a CSS-module class, so globals.css cannot name it.
 *
 * So nothing here sets a colour. Hierarchy comes from opacity and size against
 * whatever the paragraph is already using, which is correct in both themes by
 * construction and stays correct in the next one.
 *
 * ── ONLY WHERE SHE IS READING TO HERSELF ───────────────────────────────────
 *
 * The teacher note is glossed. The SAY-ALOUD LINE IS NOT, deliberately: it is
 * the words she speaks to the class, it wears no mark of its own by design
 * (see engine/renderers/say-aloud.tsx), and a tappable word inside a sentence
 * she is halfway through speaking is an interruption aimed at the wrong
 * moment. The glossary is for her, so it lives in her half of the page.
 */

const GlossaryContext = createContext<readonly PrimerTerm[]>([]);

export function GlossaryProvider(props: {
  terms: readonly PrimerTerm[] | undefined;
  children: ReactNode;
}): ReactElement {
  return (
    <GlossaryContext.Provider value={props.terms ?? []}>
      {props.children}
    </GlossaryContext.Provider>
  );
}

export function useGlossary(): readonly PrimerTerm[] {
  return useContext(GlossaryContext);
}

/** The paragraph's own state: which term, if any, is open under it. */
interface NoteScope {
  open: PrimerTerm | null;
  toggle: (entry: PrimerTerm) => void;
  revealId: string;
}

const NoteContext = createContext<NoteScope | null>(null);

/**
 * A teacher's paragraph, with its glossary words live and the meaning set out
 * beneath it.
 *
 * Renders the paragraph and nothing else when there is no glossary or nothing
 * in the line matched, which is most paragraphs. That path must stay
 * indistinguishable from the text before this existed.
 */
export function GlossedNote(props: {
  className?: string;
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState<PrimerTerm | null>(null);
  const revealId = useId();

  const scope: NoteScope = {
    open,
    revealId,
    toggle: (entry) =>
      setOpen((was) => (was && was.term === entry.term ? null : entry)),
  };

  return (
    <NoteContext.Provider value={scope}>
      <p className={props.className}>{props.children}</p>
      {open && (
        <div className="gloss-open" id={revealId} role="note">
          <p className="gloss-term">{open.term}</p>
          <p className="gloss-definition">{open.definition}</p>
          {open.forChildren && (
            <p className="gloss-forchildren">
              &ldquo;{spokenLine(open.forChildren)}&rdquo;
            </p>
          )}
        </div>
      )}
    </NoteContext.Provider>
  );
}

/**
 * One marked word.
 *
 * The button is the word itself rather than a glyph beside it: a separate
 * affordance would be a second thing on the page competing with the words, and
 * an underline already says "there is more here" in a register a book has used
 * for centuries.
 */
function GlossedTerm(props: { text: string; entry: PrimerTerm }): ReactElement {
  const scope = useContext(NoteContext);
  const open = scope?.open?.term === props.entry.term;

  // Outside a GlossedNote there is nowhere to set the meaning down, so the word
  // renders plain rather than offering a tap that cannot answer.
  if (!scope) return <>{props.text}</>;

  return (
    <button
      type="button"
      className="gloss-word"
      aria-expanded={open}
      aria-controls={scope.revealId}
      onClick={() => scope.toggle(props.entry)}
    >
      {props.text}
    </button>
  );
}

/**
 * A passage with its glossary words made live. Inline content only, so it can
 * sit alongside the entity linker's own buttons inside one paragraph.
 */
export function GlossedText(props: { children: string }): ReactElement {
  const terms = useGlossary();
  const segments = markTerms(props.children, terms);

  if (segments.length === 1 && segments[0]?.kind === "text") {
    return <>{props.children}</>;
  }

  return (
    <>
      {segments.map((segment, i) =>
        segment.kind === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <GlossedTerm key={i} text={segment.text} entry={segment.entry} />
        )
      )}
    </>
  );
}
