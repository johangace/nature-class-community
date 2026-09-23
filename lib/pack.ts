import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePack, phaseSchema, type Pack, type Phase, type Session } from "@/schema/pack";

/**
 * THE settling: one ritual, authored once, shared by every session that opens
 * with it (`session.settle`). Not a pack — a single phase in its own file.
 *
 * Shared on purpose. The settling is the part of the hour a class does the
 * same way every week, and the sameness is the mechanism: a four year old who
 * meets five identical lines in an identical order can lead herself through
 * them by week two, and a teacher who has read them three times can run the
 * ritual while watching the class instead of the screen. Five cards that
 * varied per session would be five new things to learn every week, and twelve
 * shelf sessions would hold sixty near-identical strings that drift apart the
 * first time anyone edits one of them.
 *
 * It is also what keeps the settling honest about what it is. Words that have
 * to fit Counting life and Bird feeders equally cannot mention either lesson,
 * so the ritual can only do the thing it is for, which is arriving. Naming
 * today is the next beat and has its own screen.
 *
 * Read fresh on every call, like the packs themselves: editing the settling is
 * editing one file, and it takes effect the moment it is saved.
 */
function sharedSettle(): Phase {
  const file = join(process.cwd(), "packs", "settle.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as { phase: unknown };
  return phaseSchema.parse(raw.phase);
}

/**
 * Packs are plain files on disk — no DB, no API, no network.
 * That is the offline story: a pack travels as one JSON file.
 *
 * The one composition step: a session that opts into the settling
 * (`"settle": true`) gets it as phase one here, so every surface — the runner,
 * the read-first page, the print sheet — sees the same session, and no surface
 * has to know the ritual is shared.
 */
/** Canonical authored input, before shared display phases are composed in. */
export function loadAuthoredPack(id: string): Pack {
  const file = join(process.cwd(), "packs", `${id}.json`);
  return parsePack(JSON.parse(readFileSync(file, "utf8")));
}

export function loadPack(id: string): Pack {
  const pack = loadAuthoredPack(id);
  if (!pack.sessions.some((s) => s.settle)) return pack;
  const settle = sharedSettle();
  return {
    ...pack,
    sessions: pack.sessions.map((s) =>
      s.settle ? { ...s, phases: [settle, ...s.phases] } : s
    ),
  };
}

export function getSession(pack: Pack, sessionId: string): Session {
  const session = pack.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Session "${sessionId}" not in pack "${pack.id}"`);
  return session;
}

/**
 * The catalogue: every pack file in the repo, in teaching order. This is what
 * a session id resolves against and what counts toward a class's minutes, so
 * nothing is ever taken out of here. A pack that leaves the shelf still loads:
 * its links keep working, and a session a teacher already led keeps its
 * minutes in the north-star number.
 *
 * A new pack file must be named here to exist at all.
 *
 * TWO SUMMER PACKS, and the difference matters. `summer` is the real summer
 * term: the four sessions the old production database had marked active, the
 * ones Johan chose. `summer-legacy` is the eight-session deck the same
 * database keeps under `season_key="summer-legacy"`, deactivated; the first
 * port took that set by mistake and gave it the good name, a naming mistake
 * fixed in #104. It stays in the catalogue so old links and led minutes hold,
 * and stays off the shelf.
 *
 * THREE AUTUMN PACKS, and `autumn` is NOT a recovered one. Nothing autumnal
 * was ever found in the old production database; `autumn-term` is the eight
 * contemplative sessions the prototype carried, and `autumn-starter` is the
 * four agent-authored sessions this build shipped with. `autumn` was WRITTEN
 * FRESH on 2026-08-04, at Johan's request, deliberately in the register of the
 * four summer sessions the database did hold — his own curriculum — and it
 * claims no other provenance than that. It sits in the catalogue and off the
 * shelf until Johan has read it. See PORT-LOG.md, "Not ported".
 *
 * TWO WINTER PACKS. `winter-term` is the prototype's contemplative deck, off
 * the shelf for good on Johan's word (2026-09-06: "dont pollute with
 * contemplative stuff"). `winter-starter` is the winter shelf: it opened with
 * Bark rubbings, moved out of the autumn starter the same day ("bark rubbings
 * is winter"), and grows from there.
 *
 * `living-things-spring` IS NOT A SEASON PACK. It is the first curriculum-slot
 * showcase (#564): four sessions built against the four statutory bullets of
 * England's Year 2 "Living things and their habitats", for the half term most
 * English primaries teach it in, which is the spring one that runs through
 * March and April. It sits in the catalogue and OFF the shelf, for the same
 * reason `autumn` does — no teacher sees a session Johan has not read — and
 * because the spring drawer is his (2026-09-07: spring holds the partner's
 * four titles until those lessons are built). Off the shelf it is still
 * reachable by direct link and, more to the point, by the vocabulary join
 * (#563), which reads every pack named here: a teacher who pastes her unit's
 * key words lands on these four.
 */
export const packOrder = [
  "autumn",
  "autumn-garden",
  "autumn-starter",
  "autumn-term",
  "winter-term",
  "spring-term",
  "summer",
  "summer-legacy",
  "winter-starter",
  "living-things-spring",
] as const;

/**
 * One entry on the shelf: a pack, the season it teaches into, and optionally
 * the sessions we lead with from it.
 *
 * `season` is declared rather than parsed out of the pack id. "autumn-starter"
 * happens to contain its season and "summer-legacy" happens to contain one it
 * is not on the shelf for; guessing from a filename is how a rename silently
 * reorders what a teacher is offered.
 *
 * `also` borrows sessions from OTHER packs, appended after this pack's own.
 * It exists so a founder session can sit under another season's heading
 * without its file moving: Minibeast hunting is one of the four summer rows
 * pulled from the old database and held verbatim by `verbatim-fidelity.mjs`
 * against `packs/summer.json`, and Johan wants it on the autumn shelf "for
 * now". A borrowed id is resolved through `findSession`, so it may not be
 * retired, and the pack it is borrowed from must not also list it, or the
 * shelf would show one title twice (`validate:packs` checks both).
 *
 * `lead` names the session that opens the season, for the one case `only` and
 * `also` cannot express between them: a BORROWED session teaching first.
 * Composition is own-then-borrowed, so without this a borrowed row can only
 * ever sit last, and Johan wants autumn to open on Minibeast hunting
 * (2026-09-07: "lets lead with minibeast hunting as leson 1") while its file
 * stays `packs/summer.json`. It moves one id to the front and leaves every
 * other row in its declared order; naming a session the entry does not carry
 * throws, the same as a borrow that resolves to nothing.
 */
type ShelfEntry = {
  pack: (typeof packOrder)[number];
  season: Season;
  only?: readonly string[];
  also?: readonly string[];
  lead?: string;
  /**
   * Titles a locked season will carry once its lessons are written, listed
   * under the ones it already has (Johan, 2026-09-07, on the partner's
   * sixteen: "for winter spring summer maybe just adding titles"). Shown
   * only while the season is closed; nothing links, nothing counts as led.
   * Delete a title here when its session lands in the pack.
   */
  planned?: readonly string[];
};

export type ShelfTier = "community" | "premium";

export type SeasonBrowseEntry = ShelfEntry & {
  /** Product availability on Nature Class's hosted shelf, not a content licence. */
  tier: ShelfTier;
};

/**
 * The Season browser: one pack per season, in calendar order. Naming a pack
 * here is deliberate — nothing reaches a teacher by accident — `only` narrows
 * a pack to the sessions we lead with, and `also` borrows a session from
 * another pack's file.
 *
 * `community` is the sequence Today, next-up, curriculum and the journal may
 * lead a class through. `premium` remains visible on /season so a teacher can
 * see the full programme, but is not silently counted as an included
 * Community lesson. These tiers describe the hosted product only; they do
 * not change the licence of a pack already published in this repo.
 *
 * ONE SEASON IS OPEN AT A TIME, and it is the one the class is standing in.
 * The other three are on the shelf by title, each with the month it unlocks
 * ("Unlocks December"), and nothing in them can be opened until then. Johan,
 * 2026-09-06: "for winter spring summer just keep the titles but say unlocks
 * December, unlocks March etc." Which season that is, and which month a
 * season opens, is read off the date and the hemisphere below; this array
 * only says what each season holds, and its order here is the tiebreak when
 * the calendar cannot answer (see `packsFromShelf`).
 *
 * `autumn` (the pack, not the season) is off the shelf for a different reason
 * from the rest: it is newly written rather than held back, and no teacher
 * sees a session Johan has not read.
 *
 * Packs not named here remain resolvable by direct link and keep their led
 * minutes, but are not presented in the Season browser.
 */
export const seasonBrowseShelf: readonly SeasonBrowseEntry[] = [
  {
    pack: "autumn-starter",
    season: "autumn",
    tier: "community",
    // `meet-your-tree` and `leaves-and-their-trees` are archived on Johan's
    // word (2026-09-06: "the meet your tree archive this", "leaves and their
    // trees archived"): still in the file, still resolvable by link, off the
    // shelf. `bark-rubbings` moved to the winter starter the same day.
    only: [
      "seed-searchers",
      "animal-leaf-masks",
      "nature-recycling-system",
      "conker-acorn-maths-trail",
    ],
    // Minibeast hunting is Johan's own summer session, borrowed onto the
    // autumn shelf "for now" (2026-09-06). Its file stays `packs/summer.json`,
    // and it opens the season (2026-09-07) rather than closing it.
    also: ["summer-w2-minibeast-hunting"],
    lead: "summer-w2-minibeast-hunting",
  },
  // WINTER, SPRING AND SUMMER ARE TITLE-ONLY DRAWERS FOR NOW (Johan,
  // 2026-09-07: "for winter spring summer we can keep them archived with
  // just the titles for now", and where a partner lesson overlaps one of
  // ours, "would change in favor of the partner"). Each season lists the
  // partner's four titles from the Seasonal Nature Curriculum and shows no
  // session until those lessons are built on the autumn shape. The sessions
  // that stood here (Bark rubbings, Bird watching, Bird feeders; the three
  // spring flagships; the three summer sessions) are archived: still in
  // their files, still resolvable by link, off the shelf. `only: []` is the
  // archive; `planned` is what the drawer shows.
  // Winter is built (2026-09-07, later the same day): the partner's four on
  // the autumn shape, in the partner's order. Bird watching and Bark rubbings
  // keep their ids; the other two are new.
  {
    pack: "winter-starter",
    season: "winter",
    tier: "community",
    only: ["bird-watching", "making-bird-feeders", "bark-rubbings", "winter-survival-sort"],
  },
  // `autumn-garden` (the Premium "Plant environment" collection) is held off
  // the browse shelf on Johan's ask, 2026-09-04: "for now can u hide the
  // Premium plantenvironment ones?". Direct links still resolve; the pack
  // stays in the catalogue. Restore a line for it to show it again.
  {
    pack: "spring-term",
    season: "spring",
    tier: "community",
    only: [],
    planned: [
      "Grow your own seeds",
      "Pollinator watch",
      "Butterfly life cycle wheel",
      "Nest building materials hunt",
    ],
  },
  {
    pack: "summer",
    season: "summer",
    tier: "community",
    only: [],
    planned: [
      "Bug hunt bingo",
      "Shadow and sun investigation",
      "Wildflower pressing and bookmarks",
      "Bug hotel building",
    ],
  },
];

/** The included Community sequence. Product progression reads only this list. */
export const seasonShelf: readonly ShelfEntry[] = seasonBrowseShelf
  .filter((entry) => entry.tier === "community")
  .map((entry) => ({
    pack: entry.pack,
    season: entry.season,
    ...(entry.only ? { only: entry.only } : {}),
    ...(entry.also ? { also: entry.also } : {}),
    ...(entry.lead ? { lead: entry.lead } : {}),
    ...(entry.planned ? { planned: entry.planned } : {}),
  }));

/**
 * A shelf entry as the pack it presents: the pack's own shelf sessions, then
 * any it borrows. Every reader of the shelf goes through this one function —
 * the browse page, the curriculum sequence, the offline release — so `only`
 * and `also` mean the same thing everywhere.
 */
export function shelfPackOf(entry: ShelfEntry): Pack {
  const pack = loadPack(entry.pack);
  const own = entry.only
    ? pack.sessions.filter((s) => entry.only!.includes(s.id))
    : pack.sessions;
  const borrowed = (entry.also ?? []).map((id) => {
    const found = findSession(id);
    if (!found) throw new Error(`Shelf pack "${entry.pack}" borrows "${id}", which is not in the catalogue`);
    return found.session;
  });
  const sessions = [...own, ...borrowed];
  if (!entry.lead) return { ...pack, sessions };

  const leads = sessions.find((s) => s.id === entry.lead);
  if (!leads) {
    throw new Error(
      `Shelf pack "${entry.pack}" leads with "${entry.lead}", which it does not carry`
    );
  }
  return {
    ...pack,
    sessions: [leads, ...sessions.filter((s) => s !== leads)],
  };
}

/** The mark /season puts beside a visible pack in the hosted product. */
export function shelfTier(packId: string): ShelfTier | null {
  return seasonBrowseShelf.find((entry) => entry.pack === packId)?.tier ?? null;
}

// ---------------------------------------------------------------------------
// Which season it is, where the class is (#274)
// ---------------------------------------------------------------------------

/**
 * THE ORDER IS NO LONGER DECIDED HERE.
 *
 * It used to be. `seasonShelf` was a literal array with summer first and a
 * comment saying "summer leads because it is summer... moving the term is this
 * one edit". Nothing in the app read a date, so the term turning was a code
 * change somebody had to remember to make. A teacher opening Nature Class in
 * September would have been led with summer sessions until one did.
 *
 * Johan, 2026-08-17: "i want things to be fluid.. if anything is hardcoded aor
 * not fluid seasonally fresh is bad".
 *
 * THE TRAP IN FIXING IT. The obvious repair is a month-to-season table, and
 * that is the same bug in a different spelling: it hardcodes the NORTHERN
 * hemisphere. August is late summer in London and late winter in Melbourne,
 * and this repo ships worldwide under a grant that requires it to be agnostic.
 * So the calendar path is hemisphere-aware, keyed off latitude.
 *
 * And even that is a fallback. A place that has DECLARED its own seasons
 * (`seasonOntology`, #204/#206) is asked first, because a monsoon pack has a
 * fifth season with a non-calendar opener and no month table can express it.
 * That slot is empty today, so the calendar answers for now and stops
 * answering the moment real data lands, with no code change here.
 */
export const seasons = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof seasons)[number];

/**
 * Month to season, northern hemisphere, then flipped south of the equator.
 * Meteorological seasons (three whole months each) rather than astronomical,
 * because a school term thinks in months and nobody teaches to an equinox.
 */
const NORTHERN_BY_MONTH: readonly Season[] = [
  "winter", "winter", "spring", "spring", "spring", "summer",
  "summer", "summer", "autumn", "autumn", "autumn", "winter",
];

const OPPOSITE: Readonly<Record<Season, Season>> = {
  spring: "autumn",
  autumn: "spring",
  summer: "winter",
  winter: "summer",
};

/**
 * The season at a place, on a date. Total and never throws.
 *
 * `lat` absent means we do not know where the class is, and the honest default
 * is the northern reading — this is a UK-authored curriculum and its packs are
 * northern. It is a default, not a truth, and a class with coordinates never
 * uses it.
 */
export function seasonAt(date: Date, lat?: number | null): Season {
  const northern = NORTHERN_BY_MONTH[date.getMonth()] ?? "summer";
  const southern = typeof lat === "number" && Number.isFinite(lat) && lat < 0;
  return southern ? OPPOSITE[northern] : northern;
}

/**
 * How many seasons AHEAD `season` is of `from`, walking forward round the
 * year. The current season is 0, the next 1, the one after 2, the one just
 * gone 3. Forward, not nearest: in September winter (1) comes before spring
 * (2), and last summer (3) sits at the back where it belongs, which is the
 * order a teacher reads a year in. Nearest-distance put summer second in
 * September, which Johan read as the shelf "not in the right order".
 */
function seasonsAhead(season: Season, from: Season): number {
  const n = seasons.length;
  return (seasons.indexOf(season) - seasons.indexOf(from) + n) % n;
}

/**
 * The month a season opens, at a place. Meteorological, hemisphere-aware:
 * winter opens in December in London and in June in Melbourne. The word the
 * shelf puts beside a season that is not yet open ("Unlocks December").
 */
const OPENS_NORTHERN: Readonly<Record<Season, number>> = {
  spring: 2,
  summer: 5,
  autumn: 8,
  winter: 11,
};
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
export function seasonOpensIn(season: Season, lat?: number | null): string {
  const southern = typeof lat === "number" && Number.isFinite(lat) && lat < 0;
  const key = southern ? OPPOSITE[season] : season;
  return MONTH_NAMES[OPENS_NORTHERN[key]]!;
}

/** Every pack in the catalogue, whole. Resolution and minutes read this. */
export function loadAllPacks(): Pack[] {
  return packOrder.map((id) => loadPack(id));
}

/**
 * The shelf's packs, each narrowed to its shelf sessions and kept in shelf
 * order. A pack whose named sessions have all gone is dropped rather than
 * shown empty, so a typo in `only` cannot put a headed, sessionless shelf
 * section in front of a teacher.
 */
export interface ShelfQuery {
  /** Defaults to now. Passed explicitly by tests and by anything replaying a date. */
  date?: Date;
  /** The class's latitude, so a southern-hemisphere school reads its own season. */
  lat?: number | null;
  /**
   * The seasons this PLACE actually has, when its bioregion pack has declared
   * them (#204 `seasonOntology.seasons`). Empty means undeclared, and an
   * undeclared ontology never overrides the calendar — an unfilled slot is not
   * evidence, which is the same rule the validity resolver runs on.
   */
  declaredSeasons?: readonly string[];
}

/**
 * One season on the shelf, as the browse page presents it: its pack narrowed
 * to its shelf sessions, whether it is open, and if not, the month it opens.
 */
export interface ShelfSeason {
  pack: Pack;
  season: Season;
  tier: ShelfTier;
  /** True for the season the class is standing in; nothing else can be led. */
  open: boolean;
  /** "December", "March": the word beside a season that is not yet open. */
  opensIn: string;
  /** Titles still to be written for this season; see `ShelfEntry.planned`. */
  planned: readonly string[];
}

/**
 * The shelf, in calendar order from the season it actually is where this
 * class is, with exactly one season open.
 *
 * THIS USED TO CHANGE ORDER AND NEVER MEMBERSHIP: every pack stayed reachable
 * all year and the current season merely led. Johan changed that on
 * 2026-09-06: the other seasons stay on the shelf by title, each saying when
 * it unlocks, and nothing in them opens until the calendar turns. A session a
 * class already led keeps its minutes in the north-star number either way;
 * the catalogue (`packOrder`, `findSession`) is untouched by any of this.
 *
 * The order walks FORWARD round the year (`seasonsAhead`): autumn, then
 * winter, spring, summer in September; winter, then spring, summer, autumn in
 * December. This is what makes the term turn on its own: in December
 * `winter-starter` opens with nobody editing a file, which is the whole of
 * #274.
 *
 * A pack whose named sessions have all gone is dropped rather than shown
 * empty, so a typo in `only` cannot put a headed, sessionless shelf section
 * in front of a teacher.
 */
function seasonsFromShelf(
  shelf: readonly SeasonBrowseEntry[],
  query: ShelfQuery = {}
): ShelfSeason[] {
  const { date = new Date(), lat = null, declaredSeasons = [] } = query;
  const now = seasonAt(date, lat);

  // A place that has declared its own seasons and does not have this one is a
  // place the calendar was wrong about — a monsoon pack has no "autumn". Keep
  // authored order and open everything rather than lock the whole shelf
  // behind a season that does not exist here. Empty declarations never reach
  // this branch.
  const calendarApplies =
    declaredSeasons.length === 0 || declaredSeasons.includes(now);

  const entries = shelf
    .map((entry, authored) => ({ entry, authored }))
    .sort((a, b) => {
      if (!calendarApplies) return a.authored - b.authored;
      const ahead = seasonsAhead(a.entry.season, now) - seasonsAhead(b.entry.season, now);
      return ahead !== 0 ? ahead : a.authored - b.authored;
    });

  return entries
    .map(({ entry }) => ({
      pack: shelfPackOf(entry),
      season: entry.season,
      tier: entry.tier,
      open: !calendarApplies || entry.season === now,
      opensIn: seasonOpensIn(entry.season, lat),
      planned: entry.planned ?? [],
    }))
    // A season with no sessions but planned titles is a drawer of titles, not
    // a typo: keep it. Only a season with neither is dropped.
    .filter((s) => s.pack.sessions.length > 0 || s.planned.length > 0);
}

/**
 * Everything /season presents, open or not: included Community seasons and
 * visible Premium packs, in calendar order from the current season. This is
 * deliberately not used by Today, curriculum progression, next-up, or
 * journal-ahead; those read `shelfPacks`, which is only what is open.
 */
export function seasonBrowse(query: ShelfQuery = {}): ShelfSeason[] {
  return seasonsFromShelf(seasonBrowseShelf, query);
}

/** The packs /season presents, in its order, without the open state. */
export function seasonBrowsePacks(query: ShelfQuery = {}): Pack[] {
  return seasonBrowse(query).map((s) => s.pack);
}

/**
 * The Community packs a class can lead right now: the open season, and
 * nothing else. In September that is one pack. A test that once asserted
 * "the same thirteen sessions all year" now asserts the opposite on purpose.
 */
export function shelfPacks(query: ShelfQuery = {}): Pack[] {
  return seasonsFromShelf(
    seasonBrowseShelf.filter((entry) => entry.tier === "community"),
    query
  )
    .filter((s) => s.open)
    .map((s) => s.pack)
    // A title-only season (`planned` and nothing else) is a drawer on the
    // browse page, not a curriculum: nothing in it can be led, released
    // offline, or counted, so the pack readers leave it out.
    .filter((pack) => pack.sessions.length > 0);
}

/**
 * Every Community session on the shelf across all four seasons, open or not,
 * in the shelf's calendar order from the current season. The offline release
 * and "is this lesson on the shelf at all" questions read this; progression
 * does not.
 */
export function shelfPacksAllSeasons(query: ShelfQuery = {}): Pack[] {
  return seasonsFromShelf(
    seasonBrowseShelf.filter((entry) => entry.tier === "community"),
    query
  )
    .map((s) => s.pack)
    .filter((pack) => pack.sessions.length > 0);
}

/**
 * The pack the product leads with: the front of the shelf, narrowed to its
 * shelf sessions. Today's session and any other surface that needs a default
 * pack calls this instead of naming one, so the season a teacher lands on is
 * decided in `seasonShelf` and nowhere else. A hardcoded pack id in a page is
 * how the app ended up offering autumn in August.
 *
 * When the open season is a title-only drawer (winter, spring and summer
 * while the partner's lessons are being built, 2026-09-07), the lead is the
 * nearest season ahead that has sessions, walking forward round the year,
 * so Today has a lesson to offer rather than a list of titles. Falls back to
 * the first pack in the catalogue only if the whole shelf is empty.
 */
export function leadPack(query: ShelfQuery = {}): Pack {
  return shelfPacks(query)[0] ?? shelfPacksAllSeasons(query)[0] ?? loadPack(packOrder[0]);
}

/**
 * RETIRED SESSION IDS, and what they are now (#468).
 *
 * A session id is not only a URL parameter. It is written into
 * `session_completion.sessionId` every time a class logs a lesson, it is the
 * key a queued offline completion carries on an iPad until the next time that
 * iPad has signal, and it is what a teacher has in a link she pasted into her
 * planning. Renaming one without a map here would 404 her link, orphan her
 * logged minutes, and 400 the queued completion when it finally drains.
 *
 * So a rename is a rename PLUS an entry here, forever. This map is
 * append-only for the same reason `packOrder` is: the old id keeps resolving
 * for as long as any of those three things can still be holding it.
 *
 * `a5-leaf-collage` was the autumn starter's first session under an earlier
 * title. The lesson is called "Leaves and their trees" and always renders as
 * that, so the id said one lesson and opened another — and it collided, in
 * the reading, with the genuinely different `summer-w3-a5-leaf-collage` ("A5
 * leaf collage"). That cost a wrong bug report once already.
 */
export const RETIRED_SESSION_IDS: Readonly<Record<string, string>> = {
  "a5-leaf-collage": "leaves-and-their-trees",
  // The leaf-mask lesson moved from the Premium autumn garden to the free
  // autumn starter on Johan's ask, 2026-09-04 ("that one should go on the
  // autumn one free"), and took a starter-style id with it.
  "garden-w2-leaf-masks": "animal-leaf-masks",
};

/**
 * NODE IDS THAT ONCE EXISTED AND MUST NEVER BE HANDED OUT AGAIN.
 *
 * Keyed by session id; each entry is the set of `nid`s that were minted into
 * that session and have since gone, because the phase, block, variant or tip
 * they named was deleted.
 *
 * WHY A RETIRED SET WHEN `session.nodeSeq` ALREADY ONLY COUNTS UP. Because the
 * mark is a number in a file that people and two different programs edit. Drop
 * `nodeSeq` in a merge, hand-write an id, resolve a conflict the wrong way, and
 * the next mint starts again below the mark — and the id it reissues is not a
 * fresh handle, it is the address of a line that has been deleted. Every
 * worksheet, audio clip and prepared day that recorded the old node now points
 * at a new sentence, silently, with nothing anywhere going red. `nodeSeq` is
 * the mechanism; this is the ledger that proves the mechanism held.
 *
 * NOT A FORWARDING MAP, unlike RETIRED_SESSION_IDS above. A renamed session has
 * a successor to send a saved link to; a deleted block has nothing. The only
 * question an entry here answers is "may this id be used?", and the answer is
 * always no.
 *
 * `scripts/validate-packs.mjs` fails a live id that appears here, and tells you
 * to add an entry when a recorded id leaves the catalogue. Empty today: the
 * first mint (#330 §4) created every id in the catalogue and deleted none.
 */
export const RETIRED_NODE_IDS: Readonly<Record<string, readonly string[]>> = {};

/**
 * The id a session is known by today, given any id it has ever been known by.
 *
 * Call this on every session id that arrives from OUTSIDE this module — a URL
 * query, an API request body, a row read back from the database — and never
 * on an id read off a `Session` object, which is canonical by construction.
 * An unretired id passes straight through, so it is always safe to call.
 */
export function canonicalSessionId(sessionId: string): string {
  return RETIRED_SESSION_IDS[sessionId] ?? sessionId;
}

/**
 * Find a session across the whole catalogue, with its pack. Deliberately not
 * shelf-scoped: a session held back from the shelf is still a real session, so
 * a teacher holding its link, or who led it last term, does not hit a 404.
 *
 * Retired ids resolve to what they became (`RETIRED_SESSION_IDS`), which is
 * why every URL surface and every API route that takes a session id calls
 * this one function rather than reaching into a pack itself.
 */
export function findSession(
  sessionId: string
): { pack: Pack; session: Session } | null {
  const wanted = canonicalSessionId(sessionId);
  for (const pack of loadAllPacks()) {
    const session = pack.sessions.find((s) => s.id === wanted);
    if (session) return { pack, session };
  }
  return null;
}
