import reviewedUsCopy from "./localization-us-copy.json";
/** Bump when rendered language changes so prepared downloads are refreshed. */
export const LOCALIZATION_REVISION = "english-2026-09-07-2";
// The localization layer (#142): a parallel RENDERING, never an edit.

/**
 * The decided mechanism (Johan, 2026-08-10/11): the source packs are
 * canonical and byte-guarded; what a teacher reads is localized at render
 * time through this one seam. A US class opens "Bug hunting"; the UK class
 * keeps Johan's "Minibeast hunting"; the pack file never changes and the
 * verbatim guard never sees a diff.
 *
 * This slice is the DETERMINISTIC map: vocabulary and spelling, applied by
 * word boundary, case-aware, auditable as a table. Deliberately NOT here:
 * units inside composed lines (rides the grounding seam), the AI prompts'
 * locale (tracked on #142), and anything a table cannot do safely.
 *
 * CURRICULUM MAPPING was on that not-here list and is now DECIDED (#464): it
 * is authored per system, never translated between systems, and it is held
 * out of this map by SKIP_SUBTREES below. See that comment for why a table
 * must never touch a citation. A word goes in the map only when the swap is
 * unambiguous — "robin" stays out on purpose: it is a DIFFERENT BIRD on
 * each side of the Atlantic (the false-friend rule from the adaptation
 * doc), and species names come from verified facts, never from a map.
 *
 * Locale is derived, not asked for: a class located in the US reads US
 * English, everyone else reads the product's native UK voice. No setup
 * step, per the five-second-comprehension law. `?locale=us|uk` overrides
 * per request — the demo lever, and the escape hatch until a per-class
 * setting earns a migration.
 */

export type Locale = "uk" | "us";

export const INTL_LOCALE: Readonly<Record<Locale, string>> = {
  uk: "en-GB",
  us: "en-US",
};

/** The request-language fallback used before a new class has coordinates. */
export function localeForLanguageTag(value?: string | null): Locale {
  const preferred = value?.split(",", 1)[0]?.trim().toLowerCase();
  return preferred === "en-us" || preferred?.startsWith("en-us;") ? "us" : "uk";
}

/** One date formatter for Today, planning and paper. */
export function formatLocaleDate(date: Date, locale: Locale, timeZone?: string): string {
  return date.toLocaleDateString(INTL_LOCALE[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * The map. Lowercase base forms; capitalized forms are derived. Every entry
 * is an unambiguous same-thing-different-word swap. Species and place words
 * with different referents stay out (the false-friend rule).
 */
const UK_TO_US: ReadonlyArray<readonly [string, string]> = [
  // The place a class goes out to (#872). "Grounds" read as British to a US
  // reviewer and to the first real teacher test; the American word is
  // "schoolyard". Phrases first, because the plural noun folds into a
  // singular one and a bare swap would leave "school schoolyard" and
  // "grounds like yours" -> "schoolyard like yours". The legal idiom is
  // rewritten away before the noun rule can reach it.
  ["on the grounds that", "because"],
  ["school grounds", "schoolyard"],
  ["grounds like yours", "a schoolyard like yours"],
  ["these grounds", "this schoolyard"],
  ["grounds", "schoolyard"],
  // The word a cohort reviewer could not parse, and its family (#139, folded into #142)
  ["minibeasts", "bugs"],
  ["minibeast", "bug"],
  // School culture
  ["reception", "pre-K"],
  ["playtime", "recess"],
  ["maths", "math"],
  // Everyday vocabulary
  ["wellies", "rain boots"],
  ["tarmac", "blacktop"],
  ["rubbish", "trash"],
  ["autumn", "fall"],
  ["fortnight", "two weeks"],
  ["mum", "mom"],
  // Spelling
  ["travelled", "traveled"],
  ["travelling", "traveling"],
  ["traveller", "traveler"],
  ["practise", "practice"],
  ["learnt", "learned"],
  ["woolly jumper", "wool sweater"],
  ["jumper", "sweater"],
  ["coloured", "colored"],
  ["colourful", "colorful"],
  ["colouring", "coloring"],
  ["favourites", "favorites"],
  ["neighbours", "neighbors"],
  ["centres", "centers"],
  ["organised", "organized"],
  ["organising", "organizing"],
  ["recognised", "recognized"],
  ["recognising", "recognizing"],
  ["centimetres", "centimeters"],
  ["centimetre", "centimeter"],
  ["colours", "colors"],
  ["colour", "color"],
  ["favourite", "favorite"],
  ["centre", "center"],
  ["metres", "meters"],
  ["metre", "meter"],
  ["grey", "gray"],
  ["recognise", "recognize"],
  ["organise", "organize"],
  ["behaviour", "behavior"],
  ["neighbour", "neighbor"],
];

const RULES: ReadonlyArray<{ re: RegExp; to: string; toCap: string }> = UK_TO_US.map(
  ([from, to]) => ({
    re: new RegExp(`\\b${from}\\b`, "g"),
    to,
    toCap: to.charAt(0).toUpperCase() + to.slice(1),
  })
);

const CAP_RULES: ReadonlyArray<{ re: RegExp; toCap: string }> = UK_TO_US.map(([from, to]) => ({
  re: new RegExp(`\\b${from.charAt(0).toUpperCase() + from.slice(1)}\\b`, "g"),
  toCap: to.charAt(0).toUpperCase() + to.slice(1),
}));

/** A locale value carried as a plain string by a client prop. Anything but "us" is UK. */
export function asLocale(value?: string | null): Locale {
  return value === "us" ? "us" : "uk";
}

/** Localize one display string. UK is the native voice: identity. */
export function localizeText(text: string, locale: Locale, protectedTerms: readonly string[] = []): string {
  if (locale === "uk") return text;
  const terms = [...new Set(protectedTerms.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (terms.length) {
    const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "u");
    return text.split(pattern).map((part) => terms.includes(part) ? part : localizeText(part, locale)).join("");
  }
  // Reviewed complete sentences, where a plural-to-singular noun swap needs grammar.
  let out = (reviewedUsCopy as Record<string, string>)[text] ?? text;
  for (const r of CAP_RULES) out = out.replace(r.re, r.toCap);
  for (const r of RULES) out = out.replace(r.re, r.to);
  return out;
}

/**
 * Keys whose values are identity, plumbing, or verified data — never display
 * text. Ids especially: "summer-w2-minibeast-hunting" must stay itself, and
 * species names in sightings come from iNaturalist verbatim.
 */
/**
 * Keys whose WHOLE SUBTREE is held out of the map — value, nested objects,
 * arrays and all.
 *
 * `SKIP_KEYS` below skips a string when its own key matches. That is the
 * wrong tool for a citation, because a citation is an object: skipping the
 * key `standards` there would still let the walk descend into it and
 * localize `text` and `slot` on the way past.
 *
 * WHY A CITATION MUST NEVER BE TOUCHED. A curriculum reference is not a
 * dialect variant of another curriculum reference — "KS1 · Year 2 · Spring 2"
 * is not a spelling of "K-LS1-1". The two systems have no shared referent to
 * translate between, which is the false-friend rule (see "robin" above) in a
 * stronger form. Run the map over one anyway and a US class reads:
 *
 *   "Autumn 1"   -> "Fall 1"      a term that does not exist in the English
 *                                 school year
 *   "Reception"  -> "pre-K"       inside an English statutory reference
 *   "recognise"  -> "recognize"   inside QUOTED CROWN WORDING
 *
 * The last is the serious one. `standards[].text` is published statutory text
 * we are quoting; Americanising it silently produces a citation to something
 * that was never published. That is the same defect family as asserting more
 * than we observed, arriving through a different door — so the guard is here,
 * at the seam, rather than left to each render surface to remember.
 */
const SKIP_SUBTREES = new Set(["standards"]);

const SKIP_KEYS = new Set([
  "id",
  "key",
  "type",
  "url",
  "photoUrl",
  "imageUrl",
  "when",
  "iconicTaxon",
  // A species name is a verified fact, not display text. Both halves of it
  // stay out: `scientificName` obviously, and `commonName` because the map
  // would happily turn a "Grey heron" into a "Gray heron" — a bird that is
  // named "Grey heron" wherever you are standing. The cast's names come from
  // iNaturalist verbatim, and the false-friend rule says a table never
  // touches them.
  "scientificName",
  "commonName",
  // A TOPIC TAG IS A KEY, NOT A WORD (#1076).
  //
  // `topicTags` was held out from the start; `primaryTopic` arrived later
  // (#339) carrying a value from the SAME closed vocabulary and was never
  // added beside it. So the map read it as prose and did what the map is for:
  // `minibeasts` became `bugs`, which is the right word for an American child
  // and is not a `TopicTag` at all.
  //
  // Nothing then failed loudly. `hasTaxa("bugs")` is false, which every topic
  // consumer reads as "this topic is one taxonomy cannot express" — the
  // seasons-and-senses case — so the filter turned itself off and the door
  // fell back to the whole cast. A US class opened a minibeast hunt on a
  // horse chestnut and an oak. The same value also reaches
  // `pointmoonObservationTaxa`, so the UPSTREAM read was unfiltered too.
  //
  // Six shipped sessions carry `minibeasts`; all six were affected, and only
  // in US English, which is why it survived review here.
  //
  // The translation itself was never wrong: "minibeast" is a British schools
  // word and "bug" is the American one. It belongs on the TITLE a child hears,
  // which still localizes, and not on the tag the code matches taxa against.
  "primaryTopic",
  "topicTags",
  "settle",
]);

/**
 * Localize every display string in a session (or any pack slice) as a NEW
 * object — the loaded source is never mutated, so two requests in two
 * locales cannot bleed into each other through a shared reference.
 */
export function localizeDeep<T>(value: T, locale: Locale, protectedTerms: readonly string[] = []): T {
  if (locale === "uk") return value;
  const walk = (v: unknown, parentKey: string | null): unknown => {
    // A held-out subtree is returned as-is before any descent, so nothing
    // inside a citation is ever reached.
    if (parentKey !== null && SKIP_SUBTREES.has(parentKey)) return v;
    if (typeof v === "string") {
      return parentKey !== null && SKIP_KEYS.has(parentKey) ? v : localizeText(v, locale, protectedTerms);
    }
    if (Array.isArray(v)) return v.map((item) => walk(item, parentKey));
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val, k);
      return out;
    }
    return v;
  };
  return walk(value, null) as T;
}
