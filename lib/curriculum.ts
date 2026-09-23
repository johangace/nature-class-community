import {
  shelfPacks,
  shelfPacksAllSeasons,
  type ShelfQuery,
} from "@/lib/pack";
import type { Pack, Session } from "@/schema/pack";

/**
 * THE ONE DETERMINISTIC CURRICULUM SEQUENCE ACROSS THE SHIPPED PACKS (#55).
 *
 * THREE DIFFERENT COUNTS, THREE DIFFERENT CORPORA. Fifty-seven sessions exist
 * on disk across nine packs, which is what `npm run validate:packs` prints.
 * The Community shelf holds thirteen across four seasons (`seasonShelf` in
 * lib/pack.ts). The sequence built below is the OPEN season's share of those:
 * five in autumn, one in winter, four in spring, three in summer. Re-derive
 * each rather than trusting this paragraph: it said forty-eight for the disk
 * total from 2026-08-24 until #853, correct when written and stale three days
 * later when autumn-garden landed.
 *
 * Today used to pick its session as "the first unled session in
 * `leadPack()`'s pack", which is one pack of four, and wrapped straight back
 * to that pack's own first session once all four were led. #55 replaced that
 * with one flat sequence across every shelf pack, fixed to the shelf's
 * authored order so the calendar turning mid-course could not reshuffle
 * "what's next".
 *
 * ONE SEASON AT A TIME (Johan, 2026-09-06). The shelf now opens one season
 * and holds the other three behind the month they unlock, so the sequence a
 * class walks is the open season's sessions, in shelf order. A teacher who
 * finishes autumn's last session in November has led the season; Today says
 * so and offers the season's first session as a repeat, and December brings
 * winter's sessions with nobody editing a file. The old worry — a class
 * stranded mid-pack when the order moved — cannot arise, because the packs
 * that are not open are not in the sequence at all.
 *
 * `only` and `also` narrow and borrow exactly as the browse page does
 * (`shelfPackOf`), so the curriculum and Season count the same sessions.
 *
 * Packs are read fresh off disk on every call, like everywhere else in this
 * codebase touches them (see lib/pack.ts's own `loadPack`): editing a pack
 * file takes effect immediately, with nothing cached to go stale.
 */
export interface CurriculumEntry {
  pack: Pack;
  session: Session;
  /** This stop's index in the whole sequence, 0-based. */
  position: number;
}

function sequenceOf(packs: Pack[]): CurriculumEntry[] {
  const entries: CurriculumEntry[] = [];
  for (const pack of packs) {
    for (const session of pack.sessions) {
      entries.push({ pack, session, position: entries.length });
    }
  }
  return entries;
}

/** The open season's sessions, in shelf order. What Today and next-up walk. */
export function curriculumSequence(query: ShelfQuery = {}): CurriculumEntry[] {
  return sequenceOf(shelfPacks(query));
}

/**
 * Every Community shelf session across all four seasons, open or not, in
 * calendar order from the current season. This is "is it on the shelf at
 * all", which is what the offline release and the offline-available mark
 * ask; it is not what a class is led through today.
 */
export function shelfSequence(query: ShelfQuery = {}): CurriculumEntry[] {
  return sequenceOf(shelfPacksAllSeasons(query));
}

export interface NextUp {
  /** The first unled stop in the sequence. Null when every stop is led. */
  entry: CurriculumEntry | null;
  /** True when every session in the curriculum has been led at least once. */
  allLed: boolean;
  /** How many stops the whole curriculum holds. */
  total: number;
}

/**
 * The first session in the open season this class has not yet led.
 *
 * A REPEAT DOES NOT CORRUPT THIS. `led` is a set of session ids a class has
 * ever completed, however many times and in whatever order — leading session
 * 4 before session 2 (a manual Season jump), or leading session 1 twice (an
 * intentional repeat), both leave `led` exactly as informative as leading in
 * order: this still finds the first stop NOT in it. Nothing here tracks a
 * "current" pointer that a repeat could knock out of step.
 *
 * ALL LED IS A NAMED STATE, NOT A SILENT WRAP. The caller decides what to
 * show — this only reports that there is nothing left unled, honestly, rather
 * than returning session one dressed as "next up".
 */
export function nextUnled(
  led: ReadonlySet<string>,
  sequence: CurriculumEntry[] = curriculumSequence()
): NextUp {
  const entry = sequence.find((e) => !led.has(e.session.id)) ?? null;
  return { entry, allLed: entry === null, total: sequence.length };
}

/**
 * Where a session sits on the shelf, any season, or null when it is not on
 * it — a held-back pack (autumn-term, winter-term, summer-legacy), an archived
 * session (meet-your-tree), or a session reached by a direct link that never
 * made the shelf. Off-shelf is a real and honest answer, not a bug: not every
 * session this app can render is one the ordinary next-lesson journey walks
 * through. Reads all seasons, not only the open one, because the question it
 * answers on /run and /session is "was this released for offline", and a
 * lesson saved in November is still saved in December.
 */
export function curriculumPosition(
  sessionId: string,
  query: ShelfQuery = {}
): CurriculumEntry | null {
  return shelfSequence(query).find((e) => e.session.id === sessionId) ?? null;
}

/**
 * The stop that follows this session in the open season — the finish page's
 * honest "next up" tease (#55). Null when this session is not in the open
 * season at all, or it is the season's last stop; either way, no false claim
 * about what comes next is better than a guess. A season's last session
 * teases nothing: what comes next is a month, and the shelf says which.
 */
export function nextInSequence(
  sessionId: string,
  query: ShelfQuery = {}
): CurriculumEntry | null {
  const sequence = curriculumSequence(query);
  const at = sequence.findIndex((e) => e.session.id === sessionId);
  if (at < 0) return null;
  return sequence[at + 1] ?? null;
}
