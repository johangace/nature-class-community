import { Wordmark } from "@/app/Wordmark";
import type { AbilityBand, Block, Phase, Session } from "@/schema/pack";
import type { CastMember } from "@/lib/cast/member";
import { resolveText, spokenLine } from "@/lib/text";
import { phaseMinutes } from "@/lib/minutes";
import { phaseBlocks } from "@/lib/lesson/stretch";
import { drivingQuestion } from "@/lib/lesson/driving-question";
import { carriesNothing } from "@/lib/kit";
import { MayMeetStrip } from "./CastCards";

/**
 * THE CARDS SHE CLIPS TO HERSELF (#757).
 *
 * From the first real teacher session, 2026-08-31 — an
 * experienced outdoor educator who runs land-based programming and pre-walks her
 * terrain the day before. Her ask, before she had even seen the app:
 *
 *   "Might like more flashcards to clip and have as reminders."
 *
 * and, in the same breath, the frame the whole deck is built to:
 *
 *   "Not sure i want to be told what to do — more to help me run it."
 *
 * So this is NOT a second script. The script already prints, on A4, at
 * `?part=script`, and it is the right artefact for the night before. This is
 * the thing that goes on the lanyard: the beats in order, the words she
 * actually says, and the cues she is hunting for — at a size she can read at
 * arm's length with thirty children round her ankles and no free hand for a
 * phone.
 *
 * ── EVERY WORD ON THESE CARDS IS ALREADY IN THE PACK ───────────────────────
 *
 * The deck is a fourth WALK of the same session data — the same posture as
 * `engine/print.tsx` and `renderChildSheet`. It resolves ability variants
 * through `resolveText` and unwraps spoken lines through `spokenLine`, exactly
 * as the A4 does, so a card and the plan beside it cannot disagree about what
 * she is meant to say.
 *
 * Nothing here composes a teaching sentence. There is no summariser, no
 * shortener, and no "if the phase has no cue, write one". A phase that carries
 * no spoken line and no child task produces NO CARD, and a session with no
 * scavenger cues and no cast simply has a shorter deck. `flashCards` is a pure
 * function over the session for exactly that reason: the test can hold it to
 * "prints only what it was given" without going near a renderer.
 *
 * WHAT THE DECK CARRIES, and why each half earns its millimetres: the words
 * she SAYS, and the move her HANDS make. The deck shipped with only the first
 * of those, and a teacher reading a card at arm's length got the sentence
 * "when a leaf catches your eye, say hello to it" with no mention of the
 * gentle pick-up it introduces — the half she is actually running. The teacher's
 * frame is "more to help me run it", and running it is the demo. So a `demo`
 * block prints its named move and its numbered steps, and a card is now a
 * beat she can teach off rather than a line she can read out.
 *
 * WHAT IS DELIBERATELY LEFT OFF, and why, so the next person does not read the
 * absences as oversights:
 *
 *   teacher notes    prose paragraphs. They are the half of the plan she reads
 *                    to herself before she goes out, and they are on the A4.
 *                    Putting them here would push the card past the size a
 *                    line can be read at arm's length, which is the one
 *                    property the deck exists for.
 *   phase tips       the runner's "Stuck?" whispers. Genuinely her register —
 *                    and three per phase would double the deck. A deck too
 *                    thick to clip is not a deck.
 *   condition        a phase's wet/dry/windy alternates are a decision she
 *   variants         makes with the sky in front of her, from the plan, before
 *                    she cuts anything out.
 *   the parent line  it is the one field in the whole schema that may carry a
 *                    URL, and a printed URL is a string a child can type. The
 *                    cast cards already hold that line (photo credit prints as
 *                    text, and this repo has no `attr(href)` rule anywhere);
 *                    the deck keeps it by carrying no `parent-line` at all.
 */

/**
 * A line on a card, in one of the three registers paper can carry without
 * colour: the words she SAYS (printed inside quotation marks, the same
 * treatment `engine/print.tsx` gives a spoken block), the move her hands make
 * (a bold name over numbered steps) and the words she reads to herself
 * (italic). Quotation marks, numerals and slope all survive a photocopier;
 * a tint does not.
 */
export interface FlashLine {
  register: "spoken" | "quiet" | "do" | "check";
  text: string;
  /**
   * Only ever on a `do` line: the move's numbered steps, in the order her
   * hands do them, and the things those hands need. Held as a list rather
   * than folded into `text` because a card read at arm's length is scanned
   * down the numbers — the A4 can afford to run them together as prose
   * (`engine/print.tsx`), a 90mm card cannot.
   */
  steps?: string[];
  materials?: string[];
}

/** One card. `meta` is the minute badge, and is null when nobody authored one. */
export interface FlashCard {
  key: string;
  heading: string;
  meta: string | null;
  lines: FlashLine[];
}

/** The two block kinds that carry words a teacher says out loud. */
type SpokenBlock = Extract<Block, { type: "say-aloud" | "circle-question" }>;

function isSpoken(block: Block): block is SpokenBlock {
  return block.type === "say-aloud" || block.type === "circle-question";
}

/**
 * A phase's spoken lines, resolved for this class's band and unwrapped the
 * same way `engine/print.tsx` unwraps them, so a line the pack already carries
 * inside quotes ends up with one pair of quotation marks and not two.
 */
function spokenCues(phase: Phase, band: AbilityBand | undefined): FlashLine[] {
  return phaseBlocks(phase)
    .filter(isSpoken)
    .map((block) => ({
      register: "spoken" as const,
      text: spokenLine(resolveText(block.text, block.abilityVariants, band)),
    }));
}

/**
 * The move a phase shows with its hands, if it authored one (#252's `demo`).
 *
 * Verbatim, and in the pack's own order: the named move, then its steps, then
 * its closing observation as the last step because that is when she makes it,
 * then the things the move needs in hand. Demo blocks carry no ability
 * variants — the validator rejects them — so unlike `spokenCues` there is no
 * `resolveText` here, and adding one would imply a variant that cannot exist.
 */
function demoMoves(phase: Phase): FlashLine[] {
  return phaseBlocks(phase)
    .filter((block): block is Extract<Block, { type: "demo" }> => block.type === "demo")
    .map((block) => ({
      register: "do" as const,
      text: block.move,
      steps: [...block.steps.map((step) => step.text), ...(block.look ? [block.look] : [])],
      materials: block.materials,
    }));
}

/**
 * The deck, from the session and nothing else.
 *
 * Card 1 is the lesson itself — its title, its driving question, its length —
 * because a card found on a wet floor has to say which lesson it belongs to
 * before it says anything else. Then one card per phase, in the order she
 * teaches them. Then the scavenger cues, if this session authored any.
 *
 * The cast card is NOT built here: it is real observation data read at request
 * time, not pack data, and it renders through the strip that already exists
 * (`MayMeetStrip`). Absent a cast, there is no card — see the component below.
 */
export function flashCards(session: Session, band: AbilityBand | undefined): FlashCard[] {
  const question = drivingQuestion(session);
  const cards: FlashCard[] = [
    {
      key: "lesson",
      heading: session.title,
      meta: `${session.durationMin} min`,
      lines: [
        // The driving question, verbatim and UNQUOTED. Two of the four summer
        // prompts are statements ("Minibeast hunting.") and printing a
        // statement inside speech marks would tell her to read it out.
        //
        // Through `drivingQuestion` (#150): the card's heading is the title,
        // so "Minibeast hunting." under "Minibeast hunting" is one line of a
        // small card spent saying nothing.
        ...(question ? [{ register: "quiet" as const, text: question }] : []),
        { register: "quiet" as const, text: `Skill: ${session.namedSkill}` },
      ],
    },
  ];

  /**
   * WHAT SHE CARRIES, on the clip rather than on the A4 she left on the desk.
   *
   * The kit is the one part of the plan that is needed at the door, and the
   * door is exactly where the A4 is not. `carriesNothing` is the same guard
   * the A4 uses: a session that carries nothing gets NO card, because a card
   * headed "Carry outside" over an empty list reads as a list that failed to
   * print. The preparation line rides with it when there is one — it is the
   * other thing she does before she goes out, and it is one sentence.
   */
  if (!carriesNothing(session.kit)) {
    cards.push({
      key: "kit",
      heading: "Carry outside",
      meta: null,
      lines: [
        // ONE ITEM PER LINE, each with the same empty box the A4 prints beside
        // it. Run together as a comma list, "A5 card, one per child, glue
        // sticks" reads as four items where the pack authored three, and a
        // card whose whole job is packing cannot be ambiguous about the count.
        ...session.kit.map((item) => ({ register: "check" as const, text: item })),
        ...(session.preparation
          ? [{ register: "quiet" as const, text: session.preparation }]
          : []),
      ],
    });
  }

  for (const phase of session.phases) {
    const lines: FlashLine[] = [
      ...spokenCues(phase, band),
      // The move, under the words that introduce it, because that is the
      // order it happens in: she says the line, then she shows the move.
      // Without this a card told her what to say and left out what to do.
      ...demoMoves(phase),
      // The one durable instruction, when the phase authored one. It sits
      // under the spoken cue because that is the order it happens in: she
      // says the line, then the children work.
      ...(phase.childTask
        ? [{ register: "quiet" as const, text: phase.childTask }]
        : []),
      // The line for the older children in a mixed-age group (#466). Read off
      // the phase rather than out of `phaseBlocks`, which folds it in as a
      // teacher note — the deck carries no teacher notes, and this line is the
      // one exception a mixed-age facilitator asked for by name. Empty in
      // every shipped pack today, and absent means absent.
      ...(phase.stretch
        ? [{ register: "quiet" as const, text: phase.stretch }]
        : []),
    ];
    // A phase with nothing to say gets no card. A blank card in a clipped set
    // is worse than a shorter set: she turns it over looking for the missing
    // half.
    if (lines.length === 0) continue;
    cards.push({
      key: `phase-${phase.key}`,
      heading: phase.title,
      meta: phaseMinutes(phase),
      lines,
    });
  }

  /**
   * The scavenger cues, which the session already carries — on the CHILD'S
   * sheet, where they are printed for the children to hunt with. The teacher's own
   * repertoire is full of these ("find a tree shaped like a Y, birds in the
   * sky, a bush with berries"), and the reason they earn a place on her clip
   * is that she is the one who has to remember what the class is hunting for
   * while the sheets are in thirty pairs of hands.
   *
   * Match strips and notice lines only. The collage zone is a space, not a
   * cue; the sheet title is the lesson's own name, already on card 1; the
   * parent line goes home in a book bag and may carry a URL.
   */
  const cues: FlashLine[] = [];
  for (const block of session.childSheet) {
    if (block.type === "match-strip") {
      cues.push({ register: "quiet", text: block.prompt });
      for (const card of block.cards) {
        cues.push({ register: "quiet", text: `${card.name} — ${card.clue}` });
      }
    }
    if (block.type === "notice-line") {
      cues.push({ register: "quiet", text: block.prompt });
    }
  }
  if (cues.length > 0) {
    cards.push({ key: "look-for", heading: "Look for", meta: null, lines: cues });
  }

  return cards;
}

/**
 * The sheet: a masthead she does not cut out, then the deck.
 *
 * PAPER DECISIONS, all of them made for a school printer and a pair of
 * scissors rather than for a screenshot:
 *
 *   size       two columns inside the same 12mm A4 margin the rest of /print
 *              uses, so a card is ~90mm x 62mm — a little larger than a credit
 *              card, which is the smallest thing a 10.5pt line reads at arm's
 *              length.
 *   cut        every card carries a DASHED border. It is the cut line and it
 *              is the only line on the card, so there is nothing to mistake it
 *              for. The 6mm gap between cards is scissor room.
 *   clip       a drawn circle in the top corner of each card is where the hole
 *              punch goes. That is the whole of "clip and carry": punch, thread
 *              a treasury tag or a carabiner, hang it off a belt loop.
 *   order      every card is numbered `n/total` and repeats the lesson's name,
 *              because the deck's whole failure mode is a gust of wind.
 *   what it    when the deck is of a saved preparation, the folio also carries
 *   was for    the day and the sky it was prepared for (#1245). It is in the
 *              FOLIO rather than in the masthead or on card one, and both of
 *              those were tried: `@media print` hides `.flash-head` outright,
 *              so a notice there is in the HTML and not on the paper, and a
 *              notice on card one is absent from the seven cards she is
 *              actually holding when the sky disagrees with the plan. The
 *              folio is the only furniture every card already carries, and it
 *              costs no card slot. It costs footer height instead, which
 *              `paginateFlashCards` is told about rather than left to absorb.
 *   ink        one ink. No tints, no greys, nothing that needs colour to be
 *              understood — the same rule the cast cards are held to, for the
 *              same reason: a school copier flattens grey and keeps line.
 *   no js      it is a server component with no interaction. What prints is
 *              what the page renders.
 */
/**
 * HOW BIG A CARD IS (Johan, 2026-09-02: "do both sizes maybe? half page and
 * full page"), drawn to the two artboards Sophia measured in
 * `docs/concepts/nature-class-print-tabs-and-deck-2026-09-02.html`.
 *
 *   half  186 x 133mm, two to an A4. A4 halves in ONE straight cut across the
 *         middle — no ruler, no trimming, no offcut, a whole lesson in four
 *         cuts. 4.4x the area the deck shipped at, the spoken line at 16pt,
 *         and it still punches and clips. This is the artefact the teacher asked
 *         for, so it is the default.
 *   full  186 x 273mm, one to a sheet — the whole printable area, so there is
 *         nothing to cut and nothing to punch. The spoken line at 28pt reads
 *         across a circle of children, which is a capability the clip deck
 *         does not have and is not trying to have.
 *
 * They are two artefacts rather than one card at two scales, and the sheet
 * says which it is in its own masthead. A 297mm sheet on a lanyard reaches
 * past the hip, catches wind and needs a hand to steady, and a card that needs
 * a hand fails the same test the phone failed — so `full` is offered, never
 * led with. Card stock does not rescue it; a stiffer A4 is a stiffer sail.
 */
/** Keep authored words intact, but distribute long beats over readable cards.
 * The budget reserves room for the heading, punch and footer in both sizes.
 *
 * `preparedFor` is the folio's prepared-for line (#1245) when this deck is of a
 * saved preparation, and it is passed in HERE rather than read at the renderer
 * because it changes the footer's height and the footer is exactly what the
 * budget above reserves for. A notice added to the foot without telling the
 * paginator would be paid for out of the last authored line on a dense card —
 * clipping a teacher's own words to make room for a sentence about the
 * weather, which is the one thing #757 says never happens. */
export function paginateFlashCards(
  cards: FlashCard[],
  size: FlashSize,
  preparedFor?: string | null,
): FlashCard[] {
  const half = size === "half";
  const textHeight = (text: string, columns: number, lineHeight: number) =>
    text.split("\n").reduce((height, line) => height + Math.max(1, Math.ceil(line.length / columns)) * lineHeight, 0);
  /**
   * WHAT THE PREPARED-FOR LINE COSTS THE CARD, measured on printed cards rather
   * than reasoned about — and it costs the two sizes differently, which is the
   * part that could not have been guessed.
   *
   * Measured under `emulateMedia("print")` on every shipped session, as the gap
   * between the last authored element and the top of the folio, on a deck
   * printed straight from the pack:
   *
   *   half   595 cards. Tightest 3.0mm (`seed-searchers`); next 6.3mm.
   *   full   587 cards. Tightest 7.8mm (`garden-w5-potion-lab`); next 13.1mm.
   *
   * The longest honest notice — a day, a reading with its reach, and the limit
   * on that reading — wraps to two printed lines at both sizes: 6.4mm at 7pt on
   * the half, 8.3mm at 9pt on the full. So the half cannot absorb even its
   * first line and pays for both; the full absorbs one and pays only for the
   * wrap. Charging the full for both moved five decks onto an extra sheet to
   * solve a problem no printed card had.
   *
   * What that costs, counted rather than estimated: of 65 sessions, 9 half
   * decks and 3 full decks gain one card, and 3 and 3 of those gain one A4.
   * Only decks printed FROM A SAVED PREPARATION move — `preparedFor` is absent
   * otherwise and the budget is untouched.
   *
   * Re-measured after the change, prepared, on every session at both sizes:
   * 0 overflowing cards out of 584 and 571, tightest remaining gap 3.5mm and
   * 7.0mm. `tests/e2e/print-materials-layout.spec.ts` keeps the two tightest
   * of those on paper, so if the type or the padding moves, what moves with it
   * is caught in a browser rather than in markup.
   */
  const noticeLines = preparedFor
    ? Math.max(1, Math.ceil(preparedFor.length / (half ? 130 : 95)))
    : 0;
  const charged = half ? noticeLines : Math.max(0, noticeLines - 1);
  const footer = charged ? charged * (half ? 3.2 : 4.2) + 1 : 0;
  const budget = (half ? 84 : 205) - footer; // usable content height, in millimetres
  return cards.flatMap((card) => {
    const pages: FlashCard[] = [];
    let lines: FlashLine[] = [];
    let used = 0;
    let previousCost = 0;
    for (const line of card.lines) {
      const cost = line.register === "spoken"
        ? textHeight(line.text, half ? 56 : 32, half ? 7.9 : 12.9) + (half ? 3 : 7)
        : line.register === "do"
          ? textHeight(line.text, half ? 58 : 36, half ? 7 : 11) +
            (line.steps ?? []).reduce((height, step) => height + textHeight(step, half ? 60 : 38, half ? 6.5 : 10.9) + 2, 0) +
            (line.materials?.length ? textHeight(line.materials.join(", "), half ? 75 : 50, half ? 5 : 7) : 0) + 3
          : textHeight(line.text, half ? 68 : 43, half ? 6 : 9.2) + (half ? 2.5 : 6);
      if (lines.length > 0 && used + cost > budget) {
        // Keep an action and its following child task together; otherwise a
        // one-line instruction would be stranded on the back of its demo.
        const carry = lines.length > 1 && lines.at(-1)?.register === "do" &&
          line.register === "quiet" && previousCost + cost <= budget ? lines.pop() : undefined;
        pages.push({ ...card, key: `${card.key}-${pages.length}`, lines });
        lines = carry ? [carry] : [];
        used = carry ? previousCost : 0;
      }
      lines.push(line);
      used += cost;
      previousCost = cost;
    }
    if (lines.length) pages.push({ ...card, key: `${card.key}-${pages.length}`, lines });
    return pages.map((page, index) => ({ ...page, heading: index ? `${card.heading} · continued` : card.heading }));
  });
}

export type FlashSize = "half" | "full";

export function FlashCards({
  session,
  band,
  cast,
  located,
  placeName,
  size = "half",
  preparedFor,
}: {
  session: Session;
  band: AbilityBand | undefined;
  /** Real observation data. Empty is a real answer, and prints no card. */
  cast: CastMember[];
  located: boolean;
  placeName?: string | null;
  size?: FlashSize;
  /**
   * What this deck was prepared for, in one line (#1245), or absent when the
   * deck was printed straight from the pack and was prepared for nothing in
   * particular. Absent means absent: there is no fallback sentence, because a
   * deck that claimed a day it was not made for is the failure being fixed.
   */
  preparedFor?: string | null;
}) {
  const cards = paginateFlashCards(flashCards(session, band), size, preparedFor);
  const half = size === "half";
  // The cast card is one more card in the count when there is a cast, and no
  // card at all when there is not. Never a card headed "no species today".
  const total = cards.length + (cast.length > 0 ? 1 : 0);

  return (
    <section
      className={`flash-sheet flash-${size}`}
      aria-label={half ? "Cards to cut out and clip" : "Cards to hold up, one to a page"}
    >
      {/* The masthead names the artefact rather than the tab, so a full sheet
          is never headed "cards to clip" — it is not one, and the instruction
          under it would be a lie. A full sheet fills the printable area, so
          there is no cut line to follow and no circle to punch. */}
      <header className="flash-head">
        <h2>
          {half ? "Cards to clip" : "Cards to hold up"} &mdash; {session.title}
        </h2>
        <p>
          {half
            ? "Cut across the middle of each sheet. Punch the circles and clip the set together in order."
            : "One beat to a page, in the order you teach them."}
        </p>
      </header>

      <ul className="flash-deck">
        {cards.map((card, index) => (
          <li className={`flash-card ${card.key.startsWith("lesson-") ? "flash-cover" : ""}`} key={card.key}>
            {half && <span className="flash-punch" aria-hidden="true" />}
            <div className="flash-card-label"><span>{String(index + 1).padStart(2, "0")}</span><span>{card.key.startsWith("lesson-") ? "The lesson at a glance" : card.key.startsWith("kit-") ? "Before you go" : "Your teaching cue"}</span></div>
            <h3 className="flash-card-head">
              {card.heading}
              {card.meta && <span className="flash-mins">{card.meta}</span>}
            </h3>
            {card.key === "lesson-0" && (
              <ol className="flash-route" aria-label="Lesson sequence">
                {session.phases.map((phase) => <li key={phase.key}>{phase.title}</li>)}
              </ol>
            )}
            {card.lines.map((line, i) =>
              /* The move: its name, then its steps as a numbered list. An
                 <ol> rather than a paragraph of "1. … 2. …" because the whole
                 point of a card at arm's length is that her eye finds the
                 step she is on without reading the ones she has done. */
              line.register === "do" ? (
                <div className="flash-do" key={i}>
                  <p className="flash-move">{line.text}</p>
                  {line.steps && line.steps.length > 0 && (
                    <ol className="flash-steps">
                      {line.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  )}
                  {line.materials && line.materials.length > 0 && (
                    <p className="flash-with">with {line.materials.join(", ")}</p>
                  )}
                </div>
              ) : line.register === "check" ? (
                /* One thing to carry, and a box to tick as it goes in the
                   bag — literally the A4's own `.box`, sharing its rule, because
                   it is the same act on the copy that leaves the desk. */
                <p className="flash-check" key={i}>
                  <span className="box" aria-hidden="true" />
                  {line.text}
                </p>
              ) : (
                <p
                  className={line.register === "spoken" ? "flash-say" : "flash-quiet"}
                  key={i}
                >
                  {line.register === "spoken" ? `“${line.text}”` : line.text}
                </p>
              )
            )}
            <p className="flash-foot">
              <span>{index + 1}/{total} · {session.title}</span>
              <Wordmark seed className="print-logo" />
              {preparedFor && <span className="flash-prepared">{preparedFor}</span>}
            </p>
          </li>
        ))}

        {/* The cast, on its own card, through the strip the A4 already uses —
            names and tiers and the look-don't-touch note, never photographs.
            She is identifying a thing a child is holding up; the pictures are
            on the children's cut-out sheet. `MayMeetStrip` renders nothing for
            an empty cast, which is why this card is conditional rather than
            defensive: an invented species on a card she carries all morning is
            the invented-nature failure at its most durable. */}
        {cast.length > 0 && (
          <li className="flash-card flash-card-cast">
            {half && <span className="flash-punch" aria-hidden="true" />}
            <MayMeetStrip members={cast} located={located} placeName={placeName} />
            <p className="flash-foot">
              <span>{total}/{total} · {session.title}</span>
              <Wordmark seed className="print-logo" />
              {preparedFor && <span className="flash-prepared">{preparedFor}</span>}
            </p>
          </li>
        )}
      </ul>
    </section>
  );
}
