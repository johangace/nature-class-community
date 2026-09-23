// Server-only: calls Wikimedia Commons over HTTP; never import from a client.

import { USER_AGENT } from "@/lib/source";

/**
 * Photographs of the place itself, rather than of a species.
 *
 * WHY THIS EXISTS. Every image in this product was a species portrait. All
 * five image surfaces went through `displayPhotoAsset`, and there was no path
 * anywhere for a photograph of a wall, a pond, a hedge, a schoolyard, tree
 * canopy or the ground underfoot — which are exactly the things the
 * world-building questions ask a teacher about. Johan, 2026-08-17: "I need
 * you to find more photos of rocks, places anything!!"
 *
 * PROVIDER. Wikimedia Commons geosearch. No key, no account, no billing, no
 * spend, and it already mirrors Geograph Britain and Ireland, whose project is
 * to photograph every one-kilometre grid square of Britain. So a UK school
 * gets Geograph's landscape coverage and a US school still gets something,
 * through one adapter rather than two.
 *
 * Google's Places and Street View were the obvious alternative and are ruled
 * out on architecture, not licence: their imagery must be fetched live per
 * view and may not be cached, and this product prints child sheets and
 * teacher A4. A photograph that cannot go on paper is the wrong shape here.
 *
 * WHAT IT IS HONEST ABOUT. Geotagged density in a city is infrastructure, not
 * nature: the raw read around a north London school returns railway stations
 * before it returns hedgerows. So results are RANKED toward natural subjects
 * rather than filtered to them, and the caption a surface prints says "in your
 * area", never "in your grounds". A photograph taken two streets away is a
 * photograph of the area and nothing more, which is the same discipline as
 * `recorded` against `regional` on the cast.
 *
 * PRIVACY. Server-side only, so no teacher IP or user agent reaches Wikimedia,
 * only a coordinate already rounded to ~100m by the class store. No child, no
 * account identifier, nothing about who asked.
 */

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/**
 * A teacher is standing at this screen; one bounded attempt, then nothing.
 *
 * Carried as `AbortSignal.timeout` rather than an `AbortController` disarmed in
 * `.finally()` on the fetch promise (#952). That promise settles when the
 * HEADERS arrive, so clearing the timer there left `await response.json()` —
 * where the bytes actually stream — with no deadline at all, and a Commons
 * response that answered 200 and then stalled hung `/world` forever. A signal
 * stays live through the body read, which is the whole exchange. Same idiom as
 * lib/outside/pointmoon.ts.
 */
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60 * 60 * 1_000;
/**
 * A read that FAILED is remembered too, and for a minute rather than an hour.
 *
 * `/world` is force-dynamic and awaits this inside a `Promise.all`, so while
 * Commons is slow or unreachable an uncached failure costs every render of
 * every located class the full timeout again. Caching the failure spends one
 * timeout a minute instead of one per render; the short TTL is what keeps it a
 * back-off rather than an hour of silence after a single bad second. Same rule
 * and same reasoning as `SILENT_TTL_MS` in lib/outside/pointmoon.ts.
 */
const SILENT_TTL_MS = 60 * 1_000;
const DEFAULT_RADIUS_M = 2_000;
/** Commons caps geosearch radius at 10km. */
const MAX_RADIUS_M = 10_000;

/** One photograph of somewhere near the school. */
export interface PlacePhoto {
  /** Stable within a response: the React key. */
  id: string;
  /** The Commons file title, cleaned of its `File:` prefix and extension. */
  title: string;
  /** A width-bounded thumbnail, not the multi-megabyte original. */
  url: string;
  /** The Commons description page: where the rights actually live. */
  sourceUrl: string;
  /** Who to credit, as plain text. Never rendered without this. */
  credit: string;
  /** Recorded as stated, never judged. "unstated" when none travelled. */
  license: string;
  /**
   * Whether this photograph was found near the school or anywhere at all.
   *
   * The same discipline the cast runs on, where `recorded` is never spoken as
   * `regional`. A photograph of an oak from four kilometres away and a
   * photograph of an oak from another country are both useful and are not the
   * same claim, so the surface is told which it has and captions it.
   */
  locality: "here" | "anywhere";
}

export interface PlacePhotoRead {
  photos: PlacePhoto[];
  /**
   * False means the read failed or we had no coordinate — say nothing.
   * True with an empty list means Commons genuinely has nothing here, which
   * is a different fact and a surface may say so.
   */
  answered: boolean;
}

/**
 * Subjects worth leading with, in the order a world-building surface wants
 * them. Ranking only: nothing is discarded for failing to match, because a
 * photograph of the street a class walks down is still their place.
 */
const NATURAL_SUBJECTS = [
  "wood",
  "tree",
  "hedge",
  "meadow",
  "grass",
  "field",
  "park",
  "common",
  "green",
  "garden",
  "allotment",
  "pond",
  "lake",
  "river",
  "stream",
  "brook",
  "canal",
  "marsh",
  "wetland",
  "reservoir",
  "heath",
  "moor",
  "wall",
  "fence",
  "hedgerow",
  "rock",
  "stone",
  "boulder",
  "cliff",
  "beach",
  "shore",
  "nature reserve",
  "playing field",
  "playground",
  "churchyard",
  "cemetery",
  "wildlife",
];

/**
 * Depictions of a thing, which are not the thing.
 *
 * Found by asking the live search the questions a child actually asks. "acorn"
 * near a north London school returns "Acorn sculpture in Tottenham Marshes",
 * and "igneous rock" returns "igneous rock sculpture" — both real photographs,
 * both of statues. A child asking what an acorn is, and shown a monument, has
 * been answered wrongly by a system that was confident.
 *
 * Museum and specimen plates sit here for a softer version of the same reason:
 * a pinned insect in a case is a photograph of a museum. It is a fair last
 * resort and a poor first answer, so it ranks behind a living one rather than
 * being thrown away.
 *
 * Demotion, never removal. Where the only picture of a thing is a drawing of
 * it, a drawing is better than nothing, and the title renders under every
 * frame so a teacher can see what she has.
 */
const DEPICTIONS = [
  "sculpture",
  "statue",
  "monument",
  "memorial",
  "artwork",
  "mural",
  "mosaic",
  "carving",
  "engraving",
  "painting",
  "drawing",
  "illustration",
  "diagram",
  "model of",
  "replica",
  "museum",
  "specimen",
  "sign",
  "signpost",
  "pub sign",
];

/** Subjects a place surface should not lead with, pushed to the back. */
const BUILT_SUBJECTS = [
  "station",
  "railway",
  "overground",
  "underground",
  "platform",
  "tube",
  "train",
  "tram",
  "bus",
  "ticket",
  "shop",
  "pub",
  "restaurant",
  "hotel",
  "office",
  "car park",
  "roadworks",
  "signal box",
  "locomotive",
  "aircraft",
  "plaque",
  "logo",
  "map of",
  "coat of arms",
  "street",
  "road",
  "crosswalk",
  "city hall",
  "town hall",
  "flats",
  "house",
  "terrace",
];

interface CommonsPage {
  pageid?: number;
  title?: string;
  imageinfo?: Array<{
    thumburl?: string;
    url?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: unknown } | undefined>;
  }>;
}

/**
 * `ttl` travels with the entry because this map holds two different kinds of
 * answer: a read that succeeded (an hour) and a read that failed (a minute).
 * Deriving it from `answered` at lookup would also shorten the subject reads,
 * where `answered: false` means the encyclopaedia declined — a real answer,
 * not a failure — so the writer says which it wrote.
 */
const cache = new Map<string, { at: number; read: PlacePhotoRead; ttl: number }>();

/**
 * Commons returns `Artist` and other credit fields as HTML, because they are
 * wiki markup rendered for a web page. A teacher's card prints text, and a
 * child's sheet prints on paper, so the markup is stripped rather than
 * injected. Entities are decoded for the handful that actually appear in
 * bylines; anything left unrecognised stays as written rather than guessed at.
 */
function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** `File:Some Place - geograph.org.uk - 12345.jpg` becomes `Some Place`. */
function readableTitle(raw: string): string {
  const withoutPrefix = raw.replace(/^File:/i, "");
  const withoutExtension = withoutPrefix.replace(/\.(jpe?g|png|tiff?|webp|gif)$/i, "");
  return withoutExtension
    .replace(/\s*-\s*geograph\.org\.uk\s*-\s*\d+\s*$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lower is better. Natural subjects lead, built ones trail, the rest sit between.
 *
 * Two demotions beyond the word lists, both found by running this against the
 * live API rather than against a fixture:
 *
 * - **Catalogue numbers.** Rolling-stock and accession titles ("378 206
 *   Highbury 060223") took four of the first five results for a north London
 *   school. A run of three or more digits is almost never a place.
 * - **Archive photography.** Commons is rich in scanned historical prints, so
 *   Boston returned street scenes from 1897. A photograph of somewhere as it
 *   was 130 years ago does not answer "what does it look like round here".
 *
 * Ranking, never filtering. An urban school's area genuinely does contain more
 * street than hedge, and saying so is the honest answer rather than a failure.
 */
const CATALOGUE_NUMBER = /\d{3,}/;
const ARCHIVE_YEAR = /\b(?:1[6-9]\d{2}|190\d)\b/;

export function subjectRank(title: string): number {
  const haystack = title.toLowerCase();
  // A picture OF a thing beats a picture of a picture of it, whatever else
  // the title says. Checked first so "Acorn sculpture" cannot be rescued by
  // the natural-subject list it also matches.
  if (DEPICTIONS.some((word) => haystack.includes(word))) return 4;
  if (CATALOGUE_NUMBER.test(haystack) || ARCHIVE_YEAR.test(haystack)) return 3;
  if (BUILT_SUBJECTS.some((word) => haystack.includes(word))) return 2;
  if (NATURAL_SUBJECTS.some((word) => haystack.includes(word))) return 0;
  return 1;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE HERO BAR — where ranking stops being enough (#323).
 *
 * Everything above ranks and never filters, and that is right for `/world`:
 * six pictures under the line "photographs taken in your area", where an urban
 * school's area genuinely does contain more street than hedge and saying so is
 * the honest answer.
 *
 * A HERO is a different claim. It is 300px of the first screen a teacher opens
 * each morning, it is what the app looks like, and there is only one of it. A
 * car park with a tidy name, or a scanned 1974 print, reaching that slot is
 * worse than showing the drawn field and saying we have no photograph of her
 * patch — because a photograph reads as "now" in a way a sentence never does,
 * and a wrong-season photograph is therefore a bigger lie than a wrong-season
 * sentence. Decided on nc#323 rather than left to the sort.
 *
 * TWO CONDITIONS, both hero-only. Neither changes what `readPlacePhotos`
 * returns, so `/world` is untouched.
 *
 *   RANK 0 ONLY. A named natural subject. Rank 1 is refused too, and that is
 *   the arguable half: a title matching neither list is usually a proper noun,
 *   and a proper noun is as likely to be a retail park as a wood. Rank 1 is
 *   exactly where the tidily-named car parks live.
 *
 *   CREDIT MUST HAVE TRAVELLED. Credit stopped being a condition of SHOWING a
 *   picture on 2026-08-17 (Johan: "all photos no gates! we need any photo we
 *   can get"), and that ruling stands everywhere it was aimed: a species face
 *   that rendered as nothing now renders. This is not that case. The hero has
 *   a documented fallback that is not nothing, it is the largest published use
 *   of an image anywhere in the product, and Sophia's window spec makes the
 *   credit line the honesty rather than a footnote. So the hero asks for one.
 *
 * Both are one edit away from being loosened, with this paragraph attached.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The worst subject rank a photograph may have and still lead the home. */
export const HERO_SUBJECT_RANK = 0;

/**
 * Burial grounds, which rank as natural subjects and should.
 *
 * An urban churchyard is often the best wildlife habitat within walking
 * distance of a city school, and it belongs in `/world`'s list of what her
 * area looks like. Found by running this against a real north London school,
 * where the hero came back as a photograph of gravestones under trees: true,
 * well-ranked, and not the picture a primary teacher wants filling the top of
 * her screen every morning before she has had coffee.
 *
 * Hero-only, so nothing else in the product loses the coverage, and a taste
 * call rather than an honesty one — it is flagged on nc#323 and this list is
 * the one line to delete if Johan would rather have the churchyard.
 */
const HERO_EXCLUDED = ["cemetery", "churchyard", "graveyard", "burial", "crematorium"];

/** May this photograph be the window at the top of Today? */
export function clearsHeroBar(photo: PlacePhoto): boolean {
  if (subjectRank(photo.title) > HERO_SUBJECT_RANK) return false;
  const haystack = photo.title.toLowerCase();
  if (HERO_EXCLUDED.some((word) => haystack.includes(word))) return false;
  return photo.credit.trim().length > 0;
}

/** The best photograph of this place that clears the hero bar, or null. */
export function heroPlacePhoto(read: PlacePhotoRead): PlacePhoto | null {
  // Already sorted best-subject-first by readPlacePhotos, so the first that
  // clears the bar is the best that clears it.
  return read.photos.find(clearsHeroBar) ?? null;
}

function toPhoto(page: CommonsPage, locality: "here" | "anywhere"): PlacePhoto | null {
  const info = page.imageinfo?.[0];
  const url = info?.thumburl ?? info?.url;
  const sourceUrl = info?.descriptionurl;
  const rawTitle = typeof page.title === "string" ? page.title : "";
  if (!url?.startsWith("https://") || !sourceUrl?.startsWith("https://")) return null;

  const meta = info?.extmetadata ?? {};
  const credit =
    plainText(meta.Artist?.value) ||
    plainText(meta.Credit?.value) ||
    plainText(meta.Attribution?.value);
  // No longer a condition. Johan, 2026-08-17: "all photos no gates! we need
  // any photo we can get". An uncredited picture still shows; the credit line
  // simply has nothing to print.

  const title = readableTitle(rawTitle);
  if (!title) return null;

  return {
    id: String(page.pageid ?? rawTitle),
    title,
    url,
    sourceUrl,
    credit,
    license: plainText(meta.LicenseShortName?.value) || "unstated",
    locality,
  };
}

export interface PlacePhotoQuery {
  lat?: number | null;
  lng?: number | null;
  /** Metres. Clamped to Commons' 10km ceiling. */
  radiusM?: number;
  limit?: number;
}

/**
 * Photographs taken near this coordinate, best subjects first.
 *
 * Never throws and never blocks a page: any failure returns
 * `{ photos: [], answered: false }`, which a surface reads as "say nothing".
 */
export async function readPlacePhotos(query: PlacePhotoQuery = {}): Promise<PlacePhotoRead> {
  const { lat, lng } = query;
  const silent: PlacePhotoRead = { photos: [], answered: false };
  if (typeof lat !== "number" || !Number.isFinite(lat)) return silent;
  if (typeof lng !== "number" || !Number.isFinite(lng)) return silent;

  const radius = Math.min(Math.max(query.radiusM ?? DEFAULT_RADIUS_M, 100), MAX_RADIUS_M);
  const limit = Math.min(Math.max(query.limit ?? 6, 1), 24);
  // Rounded into the key so two classes at the same school share one read.
  const key = `${lat.toFixed(3)}|${lng.toFixed(3)}|${radius}|${limit}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.read;

  /** Remember the failure for a minute, so a bad upstream costs one timeout. */
  const rememberSilence = (): PlacePhotoRead => {
    cache.set(key, { at: Date.now(), read: silent, ttl: SILENT_TTL_MS });
    return silent;
  };

  const url = new URL(COMMONS_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "geosearch");
  url.searchParams.set("ggscoord", `${lat}|${lng}`);
  url.searchParams.set("ggsradius", String(radius));
  // Over-fetch, because ranking only helps when there is something to rank.
  url.searchParams.set("ggslimit", String(Math.min(limit * 6, 100)));
  url.searchParams.set("ggsnamespace", "6");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("iiurlwidth", "640");

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) return rememberSilence();
    const body: unknown = await response.json();
    const pages = (body as { query?: { pages?: Record<string, CommonsPage> } })?.query?.pages;
    if (!pages || typeof pages !== "object") {
      // A geosearch that ran and found nothing is an ANSWER, not a failure.
      const empty: PlacePhotoRead = { photos: [], answered: true };
      cache.set(key, { at: Date.now(), read: empty, ttl: CACHE_TTL_MS });
      return empty;
    }

    const seen = new Set<string>();
    const photos = Object.values(pages)
      .map((page) => toPhoto(page, "here"))
      .filter((photo): photo is PlacePhoto => photo !== null)
      .filter((photo) => (seen.has(photo.url) ? false : (seen.add(photo.url), true)))
      .sort((a, b) => subjectRank(a.title) - subjectRank(b.title))
      .slice(0, limit);

    const read: PlacePhotoRead = { photos, answered: true };
    cache.set(key, { at: Date.now(), read, ttl: CACHE_TTL_MS });
    return read;
  } catch {
    return rememberSilence();
  }
}

/** Test seam: the module cache outlives a test file otherwise. */
export function __resetPlacePhotoCache(): void {
  cache.clear();
}

/* ────────────────────────────────────────────────────────────────────────────
 * SUBJECT PHOTOGRAPHS: a picture of the thing itself.
 *
 * Johan, 2026-08-17: "if we talk about apple tree i want a pic of an apple
 * tree.. if we need photos of a rock i need image fetcher to show the rock."
 *
 * PLAIN SUBJECT SEARCH, AND DELIBERATELY NOT A LOCAL ONE. The first version of
 * this preferred a photograph taken near the school, using Commons' coordinate
 * operator, on the reasoning that a local example is worth more. Asking it the
 * questions a child actually asks showed that reasoning was wrong:
 *
 *   acorn near a north London school → "Acorn sculpture in Tottenham Marshes"
 *                                    → "Acorn Estate, Peckham"
 *                                    → "The Acorn, Haggerston"
 *
 * A monument, a housing estate and a pub. Nearby search matches places NAMED
 * after a thing, and no list of banned words separates a pub called The Apple
 * Tree from an apple tree. The nearness was buying us wrong answers.
 *
 * Johan, 2026-08-17: "an acorn doesnt have to be near london.. just acorn is
 * fine..."
 *
 * So this asks for the thing and takes the best picture of it, wherever it was
 * taken. One request instead of two, no fallback chain, and a photograph that
 * is actually of the subject. Where a class's own patch matters, that question
 * is `readPlacePhotos` above, which is about the place rather than the thing.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SubjectPhotoQuery {
  /** What to show a picture of: "acorn", "lightning", "the moon". */
  subject: string;
}

/**
 * The one picture of a named thing, or nothing.
 *
 * CANONICAL ONLY, AND NO KEYWORD FALLBACK. Commons full-text search was the
 * fallback until live reads showed what it does when it has no good answer:
 * "conker" returned "Nuri Bey Conker", a Turkish surname, and "thunder"
 * returned "Thunder Bay skyline". A keyword match always returns its best
 * guess however bad, and a confidently wrong picture in front of a child is
 * worse than no picture.
 *
 * Wikipedia can decline, which is the whole reason to use it. No image for
 * thunder, because a sound has no picture. None for conker or heather,
 * because both are disambiguation pages. Those are correct answers.
 *
 * Coverage did not suffer for it: of the eight species a real week in southern
 * England names, seven have a canonical photograph, and the eighth is
 * "Heather", which is also a person's name. Showing nothing there is right.
 */
export async function readSubjectPhotos(query: SubjectPhotoQuery): Promise<PlacePhotoRead> {
  const subject = query.subject?.trim();
  if (!subject) return { photos: [], answered: false };

  const key = `subject|${subject.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.read;

  const article = await canonicalArticle(subject);
  const canonical = article?.photo ?? null;
  const read: PlacePhotoRead = {
    photos: canonical ? [canonical] : [],
    answered: canonical !== null,
  };
  cache.set(key, { at: Date.now(), read, ttl: CACHE_TTL_MS });
  return read;
}

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";

/**
 * The canonical picture of a thing, from the encyclopaedia article about it.
 *
 * Commons full-text search is a keyword match over file names, so it is noisy
 * for exactly the words a child uses. Asked for "conker" it returns "Nuri Bey
 * Conker", a Turkish surname; asked for "acorn" its second result is a fungus.
 * Neither is wrong as a search result and both are wrong as an answer.
 *
 * Wikipedia already keeps one chosen lead image per article, and it is right
 * about the things a location can never help with. Johan, 2026-08-17: "a lot
 * of things dont need a location eg what is lighting? or what i the moon?"
 *
 *   lightning · moon · rainbow · frost · acorn   → a canonical photograph
 *   conker                                       → nothing: a disambiguation page
 *   thunder                                      → nothing: a sound has no picture
 *
 * The last two are the reason to prefer this. An article that cannot answer
 * says so, where a keyword search always returns its best guess however bad.
 *
 * Two calls, because rights matter more than round trips: Wikipedia names the
 * file, and Commons is asked who took it and under what licence. Nothing is
 * shown without that, the same rule as everywhere else here.
 */
/** The article's own picture and its opening sentence, in one read. */
interface CanonicalArticle {
  /** Wikipedia's title after redirects: "Moon" for "the moon". */
  title: string;
  /** The first sentence of the article, plain text, exactly as written. */
  definition: string | null;
  photo: PlacePhoto | null;
}

async function canonicalArticle(subject: string): Promise<CanonicalArticle | null> {
  const url = new URL(WIKIPEDIA_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "pageimages|extracts");
  url.searchParams.set("titles", subject);
  url.searchParams.set("exintro", "1");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("origin", "*");

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      query?: {
        pages?: Record<string, { title?: string; pageimage?: string; extract?: string }>;
      };
    };
    const entry = Object.values(body?.query?.pages ?? {})[0];
    if (!entry) return null;

    const extract = (entry.extract ?? "").trim();
    // "Conker may refer to:" is a list of unrelated things. Neither its lead
    // image nor its opening line belongs to any one of them, so refuse the
    // whole article rather than answer with a coincidence.
    if (/\bmay refer to\b/i.test(extract.slice(0, 80))) return null;

    const file = entry.pageimage;
    return {
      title: typeof entry.title === "string" ? entry.title : subject,
      definition: firstSentence(extract),
      photo: file ? await commonsFileRights(`File:${file}`) : null,
    };
  } catch {
    return null;
  }
}

/**
 * The opening sentence, and only that.
 *
 * An intro paragraph runs to several sentences and reads as an article. One
 * sentence reads as an answer, which is what a teacher standing in a field
 * with a child waiting actually needs.
 *
 * Splitting on ". " rather than a real tokeniser is crude and right here: the
 * cost of a bad split is a slightly long or short sentence, and every
 * alternative is a dependency.
 */
function firstSentence(extract: string): string | null {
  const text = extract.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const sentence = text.slice(0, sentenceEnd(text));
  const tidied = tidyForReadingAloud(sentence);
  return tidied.length > 0 ? tidied : null;
}

/**
 * Abbreviations whose full stop does not end a sentence.
 *
 * Splitting on the first ". " cut "formed by the cementation of sediments,
 * i.e." out of the middle of the sedimentary rock definition and handed a
 * teacher half a clause. Short, closed, and covering what actually turns up in
 * an encyclopaedia's opening line.
 */
const NOT_AN_ENDING = /\b(?:i\.e|e\.g|etc|cf|vs|approx|c|ca|fl|no|pp|al)\.$/i;

/**
 * Where the first real sentence ends.
 *
 * A full stop ends a sentence when the next thing is a capital and the words
 * before it are not an abbreviation. Still crude, and still preferred to a
 * tokeniser dependency: the cost of a wrong call is a slightly long or short
 * sentence with the article linked underneath.
 */
function sentenceEnd(text: string): number {
  const pattern = /\.\s+(?=[A-Z(])/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const upTo = text.slice(0, match.index + 1);
    if (!NOT_AN_ENDING.test(upTo)) return match.index + 1;
  }
  return text.length;
}

/**
 * The encyclopaedia's sentence, made sayable.
 *
 * Verbatim was the plan and verbatim does not survive contact with a real
 * article. The live reads gave a teacher these to read to a class:
 *
 *   "A lichen ( LY-kən, UK also LITCH-ən) is a hybrid colony of algae..."
 *   "Sedimentary rocks are types of rock formed by the cementation of
 *    sediments—i.e. particles of sand..."
 *
 * A pronunciation guide is furniture for a reader and noise for a speaker, and
 * the em dash is a character this product does not print anywhere.
 *
 * So two edits, both subtractive and neither changing a claim: parenthetical
 * asides come out, and an em dash becomes a comma the way every other surface
 * here already handles one. Nothing is added, nothing is reordered, and the
 * article is linked underneath so anyone can see what was trimmed.
 *
 * This is an editorial trim of a quotation and worth being uneasy about. It
 * earns its place because the alternative is a teacher reading a phonetic
 * respelling aloud to a class of six-year-olds.
 */
function tidyForReadingAloud(sentence: string): string {
  return sentence
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Who took a named Commons file, and under what licence. */
async function commonsFileRights(title: string): Promise<PlacePhoto | null> {
  const url = new URL(COMMONS_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("iiurlwidth", "640");

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      query?: { pages?: Record<string, CommonsPage> };
    };
    const first = Object.values(body?.query?.pages ?? {})[0];
    // Same parser as every other photograph here, so the credit rule and the
    // licence recording cannot drift between the two paths.
    return first ? toPhoto(first, "anywhere") : null;
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE ENTITY: what a thing is, what it looks like, and who said so.
 *
 * Johan, 2026-08-17: "so if a student asks what is a sedementary rock? this
 * could be a clickable entity with photos..."
 *
 * A child asks the teacher, in a field, with thirty other children waiting.
 * The answer has to be one sentence and one picture, and it has to be right.
 *
 * NOTHING HERE IS COMPOSED. The sentence is Wikipedia's own opening line,
 * carried across word for word and attributed. The picture is the article's
 * chosen image, with its photographer and licence. Where the encyclopaedia
 * declines — no article, no picture, a disambiguation page — this declines
 * too, which is why "conker" and "thunder" return nothing rather than a
 * Turkish surname and a Canadian skyline.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SubjectEntity {
  /** The word she asked about, as she typed or tapped it. */
  asked: string;
  /** What the encyclopaedia calls it: "Moon" for "the moon". */
  title: string;
  /** Wikipedia's opening sentence, verbatim. Null when the article has none. */
  definition: string | null;
  /** The article's chosen photograph. Null when it has none, as for thunder. */
  photo: PlacePhoto | null;
  /** The article itself, so a teacher can check what she is about to say. */
  sourceUrl: string;
}

const entityCache = new Map<string, { at: number; entity: SubjectEntity | null }>();

/**
 * Everything known about a named thing, or null.
 *
 * Null means we could not answer, and a surface renders nothing rather than
 * an apology. An entity with a definition and no photograph is a real and
 * useful answer: thunder is a sound.
 */
export async function readSubjectEntity(subject: string): Promise<SubjectEntity | null> {
  const asked = subject?.trim();
  if (!asked) return null;

  const key = asked.toLowerCase();
  const hit = entityCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.entity;

  const article = await canonicalArticle(asked);
  // An article with neither a sentence nor a picture has told us nothing.
  const entity: SubjectEntity | null =
    article && (article.definition || article.photo)
      ? {
          asked,
          title: article.title,
          definition: article.definition,
          photo: article.photo,
          sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(
            article.title.replace(/ /g, "_")
          )}`,
        }
      : null;

  entityCache.set(key, { at: Date.now(), entity });
  return entity;
}

/** Test seam: the entity cache outlives a test file otherwise. */
export function __resetSubjectEntityCache(): void {
  entityCache.clear();
}
