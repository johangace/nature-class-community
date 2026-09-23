import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlashCards, flashCards, type FlashSize } from "@/app/print/FlashCards";
import { sessionSchema, type Session } from "@/schema/pack";
import type { CastMember } from "@/lib/cast/member";

/**
 * THE CARDS SHE CLIPS TO HERSELF (#757).
 *
 * Provenance: the first real teacher session, 2026-08-31
 * (`docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`). Her ask, before
 * she had seen the app: "Might like more flashcards to clip and have as
 * reminders." Her frame, in the same conversation: "Not sure i want to be told
 * what to do — more to help me run it."
 *
 * Two properties are worth a machine, and neither is visible in a screenshot:
 *
 *   1. THE DECK INVENTS NOTHING. Every line on a card is a string the session
 *      already carried. A phase with no spoken line and no child task gets no
 *      card; a session with no scavenger cues gets no cue card; an empty cast
 *      gets no species card. The failure this pins is the durable one — a
 *      teacher does not carry a screen around all morning, she carries this,
 *      and a plausible-looking species on a card she has clipped to her belt
 *      is invented nature that outlives the session it came from.
 *
 *   2. IT ACTUALLY PRINTS. The card geometry, the cut line and the punch guide
 *      are worked in millimetres against the same A4 @page the rest of /print
 *      uses, and the two registers on a card are told apart by quotation marks
 *      and slope rather than by colour — because the sheet goes through a
 *      school copier. A markup test cannot see any of that, so the CSS half of
 *      this file asserts on the stylesheet, the same way
 *      `print-cast-tiers.spec.ts` does and for the same reason.
 */

const SUMMER = JSON.parse(readFileSync("packs/summer.json", "utf8"));
const AUTUMN = JSON.parse(readFileSync("packs/autumn.json", "utf8"));
/** The lead pack, and the one that authors demo moves. */
const STARTER = JSON.parse(readFileSync("packs/autumn-starter.json", "utf8"));

function packSession(pack: { sessions: unknown[] }, id: string): Session {
  const raw = (pack.sessions as { id: string }[]).find((s) => s.id === id);
  return sessionSchema.parse(raw);
}

const member = (over: Partial<CastMember> = {}): CastMember =>
  ({
    commonName: "Honey bee",
    scientificName: "Apis mellifera",
    photoUrl: "https://example.test/bee.jpg",
    photoRole: "observation",
    photoAttribution: "A. Observer",
    photoLicense: "cc-by",
    photoSourceUrl: "https://example.test/observations/1",
    iconicTaxon: "Insecta",
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "Seen near here lately.",
    ...over,
  }) as CastMember;

const html = (session: Session, cast: CastMember[] = [], size: FlashSize = "half") =>
  renderToStaticMarkup(
    <FlashCards
      session={session}
      band="reception"
      cast={cast}
      located
      placeName={null}
      size={size}
    />
  );

describe("the deck is the session's own words, in the order she teaches them", () => {
  const session = packSession(SUMMER, "summer-w1-counting-life");

  it("opens on the lesson itself, so a dropped card names its lesson", () => {
    const first = flashCards(session, "reception")[0];
    expect(first?.heading).toBe("Counting life");
    expect(first?.meta).toBe("20 min");
    // The driving question, verbatim and unquoted: two of the four summer
    // prompts are statements, and quoting one would tell her to read it out.
    expect(first?.lines).toContainEqual({
      register: "quiet",
      text: "What's living in our grounds?",
    });
  });

  it("gives every teaching phase a card, in order", () => {
    const headings = flashCards(session, "reception").map((c) => c.heading);
    expect(headings).toEqual([
      "Counting life",
      "Count",
      "See",
      "Hear",
      "Alive",
      "Living",
      "Circle",
      "Look for",
    ]);
  });

  it("carries the spoken line she actually says, byte for byte", () => {
    const markup = html(session);
    expect(markup).toContain("“Count everything that&#x27;s alive within ten steps.”");
    expect(markup).toContain("“What can you hear?”");
    // The circle questions are spoken too, and print in the same register.
    expect(markup).toContain("“What was the most surprising living thing you found?”");
  });

  it("carries the phase's one durable instruction, unspoken", () => {
    const count = flashCards(session, "reception").find((c) => c.heading === "Count");
    expect(count?.lines).toContainEqual({
      register: "quiet",
      text: "Within ten steps, point to each different living thing and count together. You do not need to know its name.",
    });
  });

  it("shows a phase's authored minutes and never a guessed one", () => {
    const cards = flashCards(session, "reception");
    expect(cards.find((c) => c.heading === "Count")?.meta).toBe("5 min");
    // The circle phase authors no length. An unknown length is absent, not
    // the session total divided by the number of phases (lib/minutes.ts).
    expect(cards.find((c) => c.heading === "Circle")?.meta).toBeNull();
  });

  it("leaves the teacher notes and the whispers on the A4", () => {
    // A card she reads at arm's length cannot also be the plan. These lines
    // are real, and they are on `?part=script`.
    const markup = html(session);
    expect(markup).not.toContain("Set the boundary first");
    expect(markup).not.toContain("Crouch down with them");
  });
});

/**
 * THE HALF THE DECK SHIPPED WITHOUT.
 *
 * #757 gave a card the words she SAYS and left off the move her HANDS make,
 * so the Collect card in Leaves and their trees read "say hello to it, notice
 * its shape" with no mention of the gentle pick-up that sentence introduces.
 * A teacher reading that at arm's length has the line and not the lesson.
 * The teacher's frame is "more to help me run it", and running it is the demo.
 *
 * The property worth a machine is the same one the rest of this file pins:
 * the steps are the pack's steps, in the pack's order, and a phase that
 * authored no move grows none.
 */
describe("the card carries the move, not only the line", () => {
  const session = packSession(STARTER, "leaves-and-their-trees");

  it("names the move and numbers its steps in the order the pack wrote them", () => {
    const collect = flashCards(session, "reception").find((c) => c.heading === "Collect");
    const move = collect?.lines.find((line) => line.register === "do");
    expect(move?.text).toBe("The gentle pick-up");
    expect(move?.steps).toEqual([
      "Lift one leaf from the ground, never from the branch.",
      "Turn it over.",
      "Meet both sides.",
    ]);
  });

  it("carries what the move needs in hand", () => {
    const collect = flashCards(session, "reception").find((c) => c.heading === "Collect");
    const move = collect?.lines.find((line) => line.register === "do");
    expect(move?.materials).toEqual(["a fallen leaf", "collecting basket"]);
  });

  it("prints the steps as a list, so her eye finds the step she is on", () => {
    // Not "1. Lift one leaf 2. Turn it over" run together as a paragraph, which
    // is what the A4 can afford and a 90mm card cannot.
    const markup = html(session);
    expect(markup).toContain("<ol class=\"flash-steps\"");
    expect(markup).toContain("<li>Turn it over.</li>");
  });

  it("grows no move for a phase that authored none", () => {
    const settle = flashCards(session, "reception").find((c) => c.heading === "Settle");
    expect(settle?.lines.some((line) => line.register === "do")).toBe(false);
    expect(flashCards(bareSession(), "reception").flatMap((c) => c.lines)).not.toContainEqual(
      expect.objectContaining({ register: "do" })
    );
  });
});

/**
 * WHAT SHE CARRIES, on the clip rather than on the A4 she left on the desk.
 * The kit is the one part of the plan that is needed at the door, and the door
 * is exactly where the A4 is not.
 */
describe("the deck carries the kit", () => {
  it("gives each thing its own line and its own box", () => {
    const session = packSession(STARTER, "leaves-and-their-trees");
    const kit = flashCards(session, "reception").find((c) => c.heading === "Carry outside");
    // One item per line, not a comma run: "A5 card, one per child, glue sticks"
    // reads as four items where the pack authored three.
    expect(kit?.lines).toContainEqual({ register: "check", text: "A5 card, one per child" });
    expect(kit?.lines).toContainEqual({ register: "check", text: "glue sticks" });
    expect(html(session)).toContain("flash-check");
  });

  it("prints no kit card for a session that carries nothing", () => {
    // A card headed "Carry outside" over an empty list reads as a list that
    // failed to print. `bareSession` carries an empty kit.
    const headings = flashCards(bareSession(), "reception").map((c) => c.heading);
    expect(headings).not.toContain("Carry outside");
  });

  it("draws the card's box with the A4's own rule, not a second one", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(".print-kit .box,\n.flash-check .box {");
  });
});

describe("the scavenger cues come off the session's own sheet", () => {
  it("carries the match strip a session authored, clue and all", () => {
    const session = packSession(AUTUMN, "autumn-w1-fruit-and-seed");
    const look = flashCards(session, "reception").find((c) => c.heading === "Look for");
    expect(look?.lines).toContainEqual({
      register: "quiet",
      text: "Which tree posted your parcel? Find it by its leaf:",
    });
    expect(look?.lines).toContainEqual({
      register: "quiet",
      text: "the oak — wavy leaf, and an acorn sitting in a little cup",
    });
  });

  it("prints no cue card at all for a session that authored none", () => {
    const session = bareSession();
    const headings = flashCards(session, "reception").map((c) => c.heading);
    expect(headings).not.toContain("Look for");
  });

  it("never carries the line that goes home, because that line may hold a url", () => {
    const session = packSession(SUMMER, "summer-w1-counting-life");
    expect(html(session)).not.toContain("For home:");
  });
});

/**
 * A session with one usable phase, one phase that says nothing out loud, and a
 * child sheet with no cues on it. Everything here is scaffolding — a title, a
 * length, a phase — and deliberately no species: this fixture exists to prove
 * the deck stays quiet, so it must not be the thing that supplies content.
 */
function bareSession(): Session {
  return sessionSchema.parse({
    id: "fixture-quiet",
    title: "A quiet session",
    topic: "Nothing much is authored here.",
    objective: "Prove that an unwritten card is not printed.",
    namedSkill: "looking",
    kit: [],
    durationMin: 15,
    phases: [
      {
        key: "one",
        title: "Said",
        blocks: [{ type: "say-aloud", text: "Stand still and look up." }],
      },
      {
        key: "two",
        title: "Unsaid",
        blocks: [{ type: "teacher-note", text: "A note to yourself, and nothing else." }],
      },
    ],
    childSheet: [{ type: "collage-zone", hint: "Draw what you saw." }],
  });
}

describe("nothing is padded, ever", () => {
  it("prints no card for a phase with no spoken line and no task", () => {
    const headings = flashCards(bareSession(), "reception").map((c) => c.heading);
    expect(headings).toContain("Said");
    // Not a card headed "Unsaid" with a blank body. She would turn it over
    // looking for the missing half.
    expect(headings).not.toContain("Unsaid");
  });

  it("prints no species card when there is no cast", () => {
    const markup = html(packSession(SUMMER, "summer-w1-counting-life"), []);
    expect(markup).not.toContain("You may meet");
    expect(markup).not.toContain("flash-card-cast");
  });

  it("prints the species it was given, and only those", () => {
    const markup = html(packSession(SUMMER, "summer-w1-counting-life"), [
      member(),
      member({ commonName: "Magpie", scientificName: "Pica pica", honestyTier: "regional" }),
    ]);
    expect(markup).toContain("Honey bee");
    expect(markup).toContain("Magpie");
    expect(markup).toContain("around the region");
  });

  it("carries look-don't-touch onto the card she has on her belt", () => {
    const markup = html(packSession(SUMMER, "summer-w1-counting-life"), [
      member({
        commonName: "Oriental hornet",
        scientificName: "Vespa orientalis",
        safetyNote: "If you see one, we watch it and let it be.",
      }),
    ]);
    expect(markup).toContain("we watch it and let it be");
  });

  it("counts the species card in the folio, so the numbers close", () => {
    const session = packSession(SUMMER, "summer-w1-counting-life");
    const n = flashCards(session, "reception").length;
    expect(html(session, [])).toContain(`1/${n} · Counting life`);
    expect(html(session, [member()])).toContain(`1/${n + 1} · Counting life`);
    expect(html(session, [member()])).toContain(`${n + 1}/${n + 1} · Counting life`);
  });
});

describe("nothing on a clipped card is a string a child could type", () => {
  const markup = html(packSession(AUTUMN, "autumn-w1-fruit-and-seed"), [member()]);

  it("prints no link and no url", () => {
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain("http");
  });

  it("prints no photograph, so no credit and no source needs to reach paper", () => {
    // The deck is names and words. Pictures are on the children's cut-out
    // sheet, which is where the scissors already are.
    expect(markup).not.toContain("<img");
  });

  /**
   * The property PR #772 established and this ticket must not undo: there is
   * no `attr(href)` rule anywhere in this repo, so a URL cannot be made to
   * print as typable text beside a link. Asserted here because the flashcards
   * are the newest printed surface and therefore the likeliest place for one
   * to be added by someone being helpful.
   */
  it("adds no rule that would print a url as text", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).not.toMatch(/attr\(\s*href/);
  });
});

describe("the deck can be cut, punched and clipped", () => {
  const css = readFileSync("app/globals.css", "utf8");

  it("draws the cut line and the punch guide on the half, which is cut out", () => {
    const markup = html(packSession(SUMMER, "summer-w1-counting-life"));
    expect(markup).toContain("flash-punch");
    expect(markup).toContain("Cut across the middle");
  });

  /**
   * A full sheet fills the printable page, so there is nothing to cut it out
   * of and nothing to punch it from. Drawing a cut line on it would be an
   * instruction to a pair of scissors with no cut to make, and the deck does
   * not print marks that mean nothing.
   */
  it("draws neither on the full sheet, which is the page", () => {
    const markup = html(packSession(SUMMER, "summer-w1-counting-life"), [], "full");
    expect(markup).not.toContain("flash-punch");
    expect(markup).not.toContain("Cut across the middle");
    expect(markup).toContain("One beat to a page");
  });

  it("makes the card border a dashed cut line, not a decoration", () => {
    const rule = css.slice(css.indexOf("\n.flash-card {"));
    expect(rule.slice(0, 400)).toMatch(/border:\s*1\.5px dashed var\(--card-ink\)/);
  });

  /**
   * Both sizes are worked in millimetres against the same A4 @page, and the
   * row height is FIXED rather than negotiated with `minmax`: 273mm of
   * printable height is exactly two 133mm halves or one 273mm full, so a half
   * is a half on every sheet, the cut lands in the same place every time, and
   * no lesson spills onto an extra sheet for want of 4mm.
   */
  it("sizes both decks in millimetres and points, on paper", () => {
    const block = printBlock();
    expect(block).toMatch(/\.flash-half \.flash-deck\s*\{[^}]*grid-auto-rows:\s*133mm/);
    // 271, not the 273mm of printable height it could have: at exactly 273 the
    // card's own border tipped it over the page and spilled the last folio
    // onto a ninth, otherwise blank, sheet.
    expect(block).toMatch(/\.flash-full \.flash-deck\s*\{[^}]*grid-auto-rows:\s*271mm/);
    // The one line each size exists for: arm's length, then across a circle.
    expect(block).toMatch(/\.flash-half \.flash-say\s*\{[^}]*font-size:\s*16pt/);
    expect(block).toMatch(/\.flash-full \.flash-say\s*\{[^}]*font-size:\s*28pt/);
    expect(block).toMatch(/\.flash-half \.flash-card\s*\{[^}]*break-inside:\s*avoid/);
    expect(block).toMatch(/\.flash-full \.flash-card\s*\{[^}]*break-inside:\s*avoid/);
    expect(block).toMatch(/\.flash-sheet\s*\{[^}]*break-before:\s*page/);
  });

  /**
   * THE BUG THIS PINS: a media query carries no weight in the cascade, so a
   * bare `.flash-card { aspect-ratio: auto }` inside @media print LOSES to the
   * screen's `.flash-full .flash-card`. Every printed card was then sized from
   * its screen ratio rather than its row, and the last card's folio spilled
   * onto a ninth sheet. The reset has to match the specificity it is undoing.
   */
  it("undoes the screen's page ratio at a specificity that can win", () => {
    const block = printBlock();
    expect(block).toMatch(
      /\.flash-half \.flash-card,\s*\.flash-full \.flash-card\s*\{[^}]*aspect-ratio:\s*auto/
    );
  });

  /**
   * The masthead is screen-only, and that is what makes both sizes fit. A4's
   * printable height at a 12mm margin leaves no room for a heading above two
   * halves or above one full, and printed it cost a card slot on the half and
   * an entire blank first sheet on the full.
   */
  it("keeps the masthead off paper, because the sheet has no room for it", () => {
    expect(printBlock()).toMatch(/\.flash-head\s*\{[^}]*display:\s*none/);
  });

  /**
   * The lesson `print-on-screen.spec.ts` paid for: /print is BROWSED as well
   * as printed, so anything that carries meaning has to live where both media
   * see it. The registers and the deck's columns are meaning.
   */
  it("keeps the layout and both registers visible on screen too", () => {
    const screen = screenCss();
    expect(screen).toMatch(/\.flash-deck\s*\{[^}]*grid-template-columns/);
    expect(screen).toContain(".flash-say");
    // Matched on the rule rather than by slicing from the first mention of the
    // class: `.flash-quiet` also appears inside grouped size selectors, and an
    // anchor that moves when a rule is added is testing the file, not the CSS.
    expect(screen).toMatch(/\n\.flash-quiet\s*\{[^}]*font-style:\s*italic/);
  });

  /**
   * WHAT IS BROWSED IS WHAT PRINTS, and on this sheet that has to include how
   * big. Without a true page ratio on screen the two sizes render identically
   * and the size control appears to do nothing until the print dialog opens.
   */
  it("previews each size at its own page ratio", () => {
    const screen = screenCss();
    expect(screen).toMatch(/\.flash-half \.flash-card\s*\{[^}]*aspect-ratio:\s*186 \/ 133/);
    expect(screen).toMatch(/\.flash-full \.flash-card\s*\{[^}]*aspect-ratio:\s*186 \/ 273/);
  });

  it("tells the two registers apart without colour", () => {
    // Quotation marks (supplied by the markup) and slope. No tint, no grey
    // fill, nothing that a photocopier flattens.
    const rules = css.slice(css.indexOf(".flash-head h2"));
    expect(rules).not.toMatch(/\.flash-[a-z-]*[^{]*\{[^}]*opacity/);
    expect(rules).not.toMatch(/\.flash-[a-z-]*[^{]*\{[^}]*background:\s*#(9|a|b|c|d)/i);
  });

  /** The @media print block that carries the deck's paper rules. */
  function printBlock(): string {
    const re = /@media print/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css)) !== null) {
      const open = css.indexOf("{", m.index);
      let depth = 0;
      let end = open;
      for (let i = open; i < css.length; i += 1) {
        if (css[i] === "{") depth += 1;
        else if (css[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const block = css.slice(m.index, end);
      if (block.includes(".flash-deck")) return block;
    }
    throw new Error("the flashcards' print block is not there");
  }

  /** Everything outside every @media print block: what a browser shows. */
  function screenCss(): string {
    return css.split("@media print").reduce((acc, chunk, i) => {
      if (i === 0) return chunk;
      let depth = 0;
      let end = 0;
      for (let j = chunk.indexOf("{"); j < chunk.length; j += 1) {
        if (chunk[j] === "{") depth += 1;
        else if (chunk[j] === "}") {
          depth -= 1;
          if (depth === 0) {
            end = j + 1;
            break;
          }
        }
      }
      return acc + chunk.slice(end);
    }, "");
  }
});

describe("the print page offers the deck", () => {
  const page = readFileSync("app/print/page.tsx", "utf8");

  it("lists it as a piece of the bundle a teacher can choose", () => {
    expect(page).toContain('"flashcards"');
    expect(page).toContain("Cards to clip");
  });

  it("hands it the same session, band and cast the other pieces read", () => {
    const call = page.slice(page.indexOf("<FlashCards"));
    expect(call.slice(0, 300)).toContain("session={session}");
    expect(call.slice(0, 300)).toContain("band={classBand}");
    expect(call.slice(0, 300)).toContain("cast={cast.members}");
  });
});
