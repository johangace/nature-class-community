/**
 * A species common name, cased for the house style, AT THE MOMENT OF PRINTING.
 *
 * ── PRESENTATION ONLY. THE STORED NAME IS NEVER EDITED. ─────────────────────
 *
 * Read scripts/verbatim-fidelity.mjs before touching this file. Three separate
 * times an agent convention has quietly rewritten strings this project did not
 * author, and every one of them looked like tidying at the time. The standing
 * rule that came out of it is that we do not edit names in the data.
 *
 * This function does not break that rule, it is the shape that respects it.
 * Nothing here writes. There is no migration, no normalising pass over
 * taxon-reference.json, no fixup in the Pointmoon reader. The bytes on disk and
 * the bytes in the live payload stay exactly as iNaturalist and Johan wrote
 * them; the render layer calls this on the way to the screen and the value it
 * was given is untouched. If this function is ever wrong, the fix is one line
 * here and a redeploy — not a data repair, which is the whole reason to solve
 * it at this layer.
 *
 * Do NOT call this before storing, comparing, keying, or matching a name.
 * `commonNameKey` in lib/cast/member.ts is the join key and it lowercases
 * everything anyway; this is for eyes only.
 *
 * ── THE PROBLEM ────────────────────────────────────────────────────────────
 *
 * iNaturalist returns `preferred_common_name` in title case, the phenology
 * rows were authored in a mix, and they land side by side in one row on the
 * Today screen:
 *
 *   "Common Cicada"  "Short-toed Snake-Eagle"  "Hermann's Tortoise"  "common fig"
 *
 * Four names, two conventions, one row. The house rule is sentence case.
 *
 * ── THE RULE, AND WHY IT IS SHAPED LIKE THIS ───────────────────────────────
 *
 * Lowercase every word after the first, capitalise the first, and preserve the
 * proper nouns. The first two thirds are trivial. The last third is the whole
 * problem, because "Snake-Eagle" and "Susan" are the same shape to a regex and
 * only one of them may be touched.
 *
 * Two mechanisms carry it, chosen by measurement rather than by taste. The
 * corpus measured was every common name reachable in this repo on 2026-08-18 —
 * 782 distinct names across lib/outside/data/taxon-reference.json (422 taxa),
 * the fifteen region files in lib/outside/data/phenology/, and the Pointmoon
 * fixtures in tests/fixtures/. The rule changes 627 of them and mangles none.
 *
 * 1. A CAPITALISED POSSESSIVE IS ALWAYS KEPT.  "Hermann's", "Anne's",
 *    "Steller's". This is unconditional on purpose. The obvious refinement —
 *    confirm the eponym against the scientific name, "Hermann's" / Testudo
 *    hermanni — was tried and rejected, see the note on `scientificName` below.
 *
 * 2. EVERYTHING ELSE PROPER IS LISTED.  Geography, demonyms, holidays, and the
 *    handful of personal names that appear WITHOUT an apostrophe. A list is
 *    unsatisfying and it is also the honest answer: no property of the string
 *    separates the "Susan" in black-eyed Susan from the "Sparrow" in song
 *    sparrow. It is content knowledge, and content knowledge has to be written
 *    down by someone who knows it.
 *
 * WE NEVER ADD A CAPITAL except to the first letter. A name that arrives as
 * "hermann's tortoise" comes out as "Hermann's tortoise" and the possessive is
 * left lowercase, because inventing a capital is a claim about a word and this
 * function is not entitled to make one. Lowercasing is recoverable by reading
 * the source; a wrong capital looks authored.
 *
 * ── THE ONE KNOWN IMPERFECTION ─────────────────────────────────────────────
 *
 * "Pink Lady's Slipper" comes out as "Pink Lady's slipper". "Lady's" is a
 * common noun, not a proper one, so strictly it should read "Pink lady's
 * slipper" — the corpus itself carries that spelling in the lowercase variant.
 * It is left over-capitalised knowingly. Rule 1 is unconditional because the
 * alternative mangles real names (again, see below), and over-capitalising one
 * common noun is a cosmetic miss where lowercasing "Hermann's" or "Anne's"
 * would be exactly the kind of silent rewrite this codebase has been burned by.
 * One is untidy. The other is editing the author out.
 *
 * ── THE RESIDUAL RISK, STATED PLAINLY ──────────────────────────────────────
 *
 * The names on screen come from the LIVE Pointmoon payload (lib/cast/live.ts
 * resolves per request), so the real input space is every common name
 * iNaturalist holds, not the 782 measured here. The measured corpus is a proxy
 * and it is the only proof available.
 *
 * The one class of name this cannot get right unaided is a BARE PERSONAL
 * EPONYM — a person's name inside a species name with no apostrophe to mark it
 * — that is not in PROPER_NOUNS. Three of the 782 are of that shape (Susan,
 * Joe-Pye, and Queen Anne's, which rule 1 catches anyway), so roughly 0.4%, and
 * almost all such names put the eponym first, where it is preserved for free.
 * When one surfaces, add the word to PROPER_NOUNS and add the name to the spec.
 * That is the maintenance cost of this approach and it was accepted with eyes
 * open, because the alternative is leaving four spellings in one row.
 */

/**
 * Proper nouns that keep their capital anywhere in a name.
 *
 * Lowercase entries; matching is case-insensitive. Grouped by why each group
 * is here, because a flat alphabetical list gives a reviewer no way to judge
 * whether an addition belongs.
 *
 * DELIBERATELY ABSENT: ordinary adjectives that merely look geographic —
 * "northern", "eastern", "coastal", "polar", "tropical", "alpine". They are
 * lowercase in sentence case and the corpus already spells them that way
 * ("eastern white pine", "western sword fern"). Also absent: genus words used
 * generically as English — "trillium", "hepatica", "fuchsia", "magnolia",
 * "luna", "rugosa". Those SHOULD lowercase; "Western trillium" is correct and
 * "Western Trillium" is not.
 */
export const PROPER_NOUNS: ReadonlySet<string> = new Set([
  // Continents, oceans, seas and biogeographic regions.
  "africa", "african", "america", "american", "americas", "adriatic", "aegean",
  "antarctic", "arctic", "asia", "asian", "atlantic", "australia", "australian",
  "baltic", "balkan", "caribbean", "eurasia", "eurasian", "europe", "european",
  "himalayan", "iberian", "indian", "ionian", "mediterranean", "oriental",
  "pacific", "scandinavian", "siberian",

  // Countries, nationalities and peoples.
  "albanian", "algerian", "argentine", "armenian", "austrian", "belgian",
  "brazilian", "british", "bulgarian", "canada", "canadian", "chilean",
  "chinese", "corsican", "cretan", "croatian", "cuban", "cypriot", "czech",
  "dalmatian", "danish", "dutch", "egyptian", "england", "english", "ethiopian",
  "finnish", "french", "german", "greek", "greenland", "hungarian", "iceland",
  "icelandic", "india", "indonesian", "iranian", "irish", "israeli", "italian",
  "japan", "japanese", "kenyan", "korean", "lapland", "macedonian", "madagascan",
  "malagasy", "malaysian", "maltese", "mexican", "mexico", "mongolian",
  "montenegrin", "moroccan", "nepalese", "netherlands", "norway", "norwegian",
  "persian", "peruvian", "polish", "portugal", "portuguese", "romanian",
  "russian", "sardinian", "scots", "scottish", "serbian", "sicilian", "slovak",
  "slovenian", "somali", "spanish", "swedish", "swiss", "syrian", "taiwan",
  "tibetan", "tunisian", "turkish", "ukrainian", "welsh",

  // North American states, provinces and named landscapes that name species.
  "alabama", "alaska", "alaskan", "aleutian", "allegheny", "appalachian",
  "arizona", "arkansas", "baja", "california", "californian", "carolina",
  "catalina", "chihuahuan", "colorado", "columbia", "connecticut", "dakota",
  "delaware", "florida", "georgia", "hawaii", "hawaiian", "idaho", "illinois",
  "indiana", "iowa", "kansas", "kentucky", "labrador", "louisiana", "maine",
  "manitoba", "maryland", "michigan", "minnesota", "mississippi", "missouri",
  "mojave", "montana", "nebraska", "nevada", "newfoundland", "nootka",
  "oklahoma", "ontario", "oregon", "ozark", "pennsylvania", "puget", "quebec",
  "rockies", "saskatchewan", "sonoran", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "wisconsin", "wyoming", "yukon", "york",

  // British and Irish places that name species.
  "cornish", "dartmoor", "devon", "hebridean", "highland", "kerry", "norfolk",
  "orkney", "shetland", "sussex", "wicklow", "yorkshire",

  // Holidays and celestial proper nouns. The phenology rows carry seasonal
  // entries as well as species ("Canada Day nature", "Perseid meteor shower")
  // and they come through this same field.
  "christmas", "easter", "geminid", "geminids", "halloween", "leonid",
  "leonids", "orion", "perseid", "perseids", "thanksgiving",

  // BARE PERSONAL EPONYMS — a person's name with no apostrophe to mark it.
  // This is the category that cannot be derived and must be hand-known. Each
  // one below is a real person: Susan (black-eyed Susan), Joe Pye, David
  // Douglas, Joseph Callery, William Willard Ashe, Nicholas Garry, George
  // Engelmann, Lord Baltimore. "Chinook" is a people, not a place.
  "ashe", "baltimore", "callery", "chinook", "douglas", "engelmann", "garry",
  "joe", "pye", "susan",
]);

/**
 * Proper names of more than one word.
 *
 * These cannot be single tokens because their parts are ordinary elsewhere, and
 * that difference is visible in the corpus: "Rocky Mountain iris" keeps its
 * Mountain and "Texas mountain laurel" does not. Same word, two right answers,
 * decided only by what sits beside it.
 */
export const PROPER_PHRASES: ReadonlyArray<readonly string[]> = [
  "new england", "new york", "new zealand", "new mexico", "new jersey",
  "new hampshire", "new guinea", "new caledonia", "new south wales",
  "new brunswick", "new forest", "nova scotia", "northern ireland",
  "rocky mountain", "rocky mountains", "cascade range", "sierra nevada",
  "great lakes", "great plains", "great basin", "long island", "cape may",
  "north america", "north american", "south america", "south american",
  "central america", "central american", "south africa", "south african",
  "west indian", "costa rica", "costa rican", "puerto rico", "puerto rican",
  "san juan", "santa cruz", "st john's", "canada day", "queen anne's",
  "milky way",
].map((phrase) => phrase.split(" "));

/**
 * Words, for casing purposes: a letter followed by letters and apostrophes.
 *
 * Deliberately not a split. Walking matches and copying the gaps back verbatim
 * means every space, hyphen, slash, bracket, colon and stray double space in
 * the source survives byte for byte — "Cherry Blossom (Early Varieties)" and
 * "Shadbush / Serviceberry" come back with their punctuation exactly as it
 * arrived. Only letters ever change. Unicode-aware so an accented name
 * ("Küken", "Ánfora") is a word and not three.
 *
 * Both apostrophes, because iNaturalist emits the typographic one.
 */
const WORD = /[\p{L}][\p{L}’']*/gu;

/**
 * Cased for display. Pure, total, and idempotent — running it on its own
 * output changes nothing, which matters because a render layer may well call
 * it on a value that has already been through it.
 *
 * ON THE MISSING `scientificName` PARAMETER. It was specified, it was built,
 * it was measured against the corpus, and it was removed because it does net
 * harm. Two ways to use it were tried:
 *
 *   As a POSITIVE signal — keep a capital when the word appears in the
 *   binomial — it wrongly preserves at least six measured names, because the
 *   genus so often IS the English word: "Magnolia Warbler" / Setophaga
 *   magnolia, "Western Trillium" / Trillium ovatum, "Round-lobed Hepatica" /
 *   Hepatica americana, "Hardy Fuchsia" / Fuchsia magellanica, "Rosa Rugosa" /
 *   Rosa rugosa, "North American Luna Moth" / Actias luna. Every one of those
 *   should lowercase and the check stops it.
 *
 *   As a FILTER on rule 1 — lowercase a possessive UNLESS the binomial
 *   confirms it — it mangles real eponyms whose epithet does not carry the
 *   name: Wilson's Warbler / Cardellina pusilla, Wilson's Snipe / Gallinago
 *   delicata, Brewer's Blackbird / Euphagus cyanocephalus. It would also have
 *   turned Queen Anne's Lace / Daucus carota into "Queen anne's lace".
 *
 * So the signal reads plausible and measures wrong in both directions. Taking
 * the parameter and ignoring it would be worse than not taking it, so the
 * signature is one argument. If a future case needs the binomial, put the
 * measurement in the spec before the parameter goes back.
 *
 * @param commonName The stored name, exactly as it arrived. Never modified.
 * @returns The same name cased for the screen. Non-strings and blanks pass
 *          through untouched: a caller with nothing to print should render
 *          nothing, not "" turned into something.
 */
export function displaySpeciesName(commonName: string): string {
  if (typeof commonName !== "string" || commonName.trim() === "") {
    return commonName;
  }

  const words: Array<{ text: string; at: number }> = [];
  for (const match of commonName.matchAll(WORD)) {
    words.push({ text: match[0], at: match.index });
  }
  if (words.length === 0) return commonName;

  const lower = words.map((word) => word.text.toLowerCase());
  const keep = new Array<boolean>(words.length).fill(false);

  // Phrases first: a match protects every word inside it, so "Rocky Mountain"
  // survives even though "mountain" alone is not a proper noun.
  for (const phrase of PROPER_PHRASES) {
    for (let i = 0; i + phrase.length <= lower.length; i += 1) {
      let hit = true;
      for (let j = 0; j < phrase.length; j += 1) {
        if (lower[i + j] !== phrase[j]) {
          hit = false;
          break;
        }
      }
      if (hit) {
        for (let j = 0; j < phrase.length; j += 1) keep[i + j] = true;
      }
    }
  }

  for (let i = 0; i < words.length; i += 1) {
    const text = words[i]!.text;
    if (PROPER_NOUNS.has(lower[i]!)) keep[i] = true;
    // Rule 1: a capitalised possessive is an eponym until proven otherwise.
    // The uppercase test is what keeps us from ADDING a capital to a name that
    // arrived lowercase.
    if (/[’']s$/.test(text) && /^\p{Lu}/u.test(text)) keep[i] = true;
  }

  let out = "";
  let cursor = 0;
  for (let i = 0; i < words.length; i += 1) {
    const { text, at } = words[i]!;
    out += commonName.slice(cursor, at); // the gap, verbatim
    if (i === 0) {
      // Only the first letter is touched. The rest of the first word is left
      // alone so "Short-toed" and "MacGillivray's" survive intact.
      out += text.charAt(0).toUpperCase() + text.slice(1);
    } else {
      out += keep[i] ? text : text.toLowerCase();
    }
    cursor = at + text.length;
  }
  return out + commonName.slice(cursor);
}
