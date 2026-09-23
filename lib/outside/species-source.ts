// Server-only: fetches a species' natural-history text from Wikipedia. Never
// import from a client component.

import { USER_AGENT } from "@/lib/source";

/**
 * WHERE THE FACTS ABOUT AN ANIMAL COME FROM (#218).
 *
 * Johan, on the live hornet profile: *"it says it is an insect .. that is so
 * bad.. no info at all."* Said again on 2026-08-18 against a Short-toed
 * Snake-Eagle whose whole "what it is" section read "This is a bird."
 *
 * That is not a rendering bug. The profile could only ever say what the
 * product held, and the product held a taxon label and a hand-typed regional
 * phenology carrying 57 species for southern England (#334). Any species
 * outside that file — which is most species, in most places — got the taxon
 * sentence alone.
 *
 * The tempting fix is to let the model write the natural history. It knows a
 * short-toed snake eagle eats snakes, and it would write it well. It is also
 * the one thing not allowed here: facts are grounded, the sentence is the
 * model's, and a paragraph of plausible biology from training data is the
 * invented-nature failure wearing a lab coat.
 *
 * So this file is the FACTS half. It fetches the article a real encyclopaedia
 * holds about this taxon and hands the text to lib/ai/species-note.ts, which
 * may only compress what is here.
 *
 * ── WHY THE ARTICLE AND NOT INATURALIST'S SUMMARY ──────────────────────────
 *
 * iNaturalist is already the app's species source and its taxon record carries
 * a `wikipedia_summary` — but only the lede, which for this eagle is two
 * sentences of Greek etymology and nothing a class could use. The behaviour,
 * the diet and the field marks live in the sections below it. So we go to the
 * article, through the redirect that maps a scientific name onto whatever the
 * page happens to be titled.
 *
 * Wikipedia text is CC BY-SA. What renders is a short model-written summary
 * derived from it, so the profile carries the source link and the licence
 * beside it, the same way a borrowed photograph carries its photographer.
 *
 * ── THE IDENTITY CHECK IS THE WHOLE RISK ───────────────────────────────────
 *
 * A redirect landing on the wrong page produces a confident, well-sourced,
 * completely wrong animal, and nothing downstream could catch it: the model
 * would faithfully compress the wrong article. The related trap is already in
 * the record — iNaturalist's fuzzy taxon search returns the wrong animal, and
 * that cost a day. So the article's opening must NAME this taxon. If it does
 * not, we hold nothing and the profile is shorter, which is a state every
 * surface here is already built for.
 */

const API = "https://en.wikipedia.org/w/api.php";
const TIMEOUT_MS = 8_000;

/** Wikipedia's API policy asks for a real agent with a contact. */
const AGENT = USER_AGENT;

/** The model reads this much and no more. Enough for behaviour and diet. */
const MAX_CHARS = 6_000;

/**
 * Sections dropped before the model sees the text.
 *
 * Taxonomy and etymology are the largest sections on most species articles and
 * the least use to anybody standing outside with thirty children. Dropping
 * them is not censoring a fact, it is spending the model's attention on the
 * half a teacher can use.
 */
const SKIP_SECTIONS =
  /^(taxonomy|etymology|systematics|nomenclature|references|external links|see also|further reading|bibliography|notes|gallery|in culture|cultural|popular culture|footnotes|sources)\b/i;

export interface SpeciesSource {
  /** The article's own title, for the credit line. */
  title: string;
  /** The article, for the credit link. */
  url: string;
  /** Plain text, sectioned down, capped. The only facts the model may use. */
  text: string;
}

/**
 * Held for a day. A species article does not change over a school term, and
 * every class in a region asks about the same handful of species on the same
 * morning.
 */
const CACHE_MS = 24 * 60 * 60 * 1_000;
const cache = new Map<string, { at: number; value: SpeciesSource | null }>();

interface ExtractResponse {
  query?: {
    pages?: Record<string, { title?: string; extract?: string; missing?: string }>;
  };
}

/** Strip the sections a teacher will not use, and cap what is left. */
export function trimArticle(extract: string): string {
  const kept: string[] = [];
  let skipping = false;

  for (const line of extract.split("\n")) {
    // Section headings arrive as "== Description ==" at any depth.
    const heading = line.match(/^=+\s*(.+?)\s*=+$/);
    if (heading) {
      const title = heading[1] ?? "";
      skipping = SKIP_SECTIONS.test(title);
      if (!skipping) kept.push(`\n${title}:`);
      continue;
    }
    if (!skipping && line.trim()) kept.push(line.trim());
  }

  return kept.join("\n").trim().slice(0, MAX_CHARS);
}

/**
 * Does this article open by naming the taxon we asked about?
 *
 * The only guard between a redirect and a confidently wrong animal. The
 * scientific name is the strong form — one string worldwide — so when we have
 * one it must appear, and the common name is NOT accepted in its place: half
 * the point of a scientific name is that "Robin" is two different birds on two
 * continents. A cast member without one falls back to the common name, which
 * is weaker and is why the cast carries scientific names nearly everywhere.
 */
export function namesTheTaxon(
  extract: string,
  scientificName: string | null,
  commonName: string
): boolean {
  const lede = extract.slice(0, 1_200).toLowerCase();
  const scientific = scientificName?.trim().toLowerCase();
  if (scientific) return lede.includes(scientific);
  const common = commonName.trim().toLowerCase();
  return common.length > 0 && lede.includes(common);
}

/**
 * The article for one species, or null.
 *
 * Null is an ordinary answer: an obscure taxon with no article, a fetch that
 * timed out mid-lesson, a redirect that landed somewhere else. Every caller
 * renders a shorter profile rather than a broken one.
 */
export async function getSpeciesSource(query: {
  commonName: string;
  scientificName?: string | null;
}): Promise<SpeciesSource | null> {
  // The scientific name is the lookup when we have one: it redirects onto the
  // article whatever the page is titled, and it cannot collide.
  const title = query.scientificName?.trim() || query.commonName.trim();
  if (!title) return null;

  const key = title.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const value = await fetchSource(title, query);
  // A timeout is not a day-long absence. Failed lookups may recover on retry.
  if (value) {
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value });
  }
  return value;
}

async function fetchSource(
  title: string,
  query: { commonName: string; scientificName?: string | null }
): Promise<SpeciesSource | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      prop: "extracts",
      explaintext: "1",
      redirects: "1",
      format: "json",
      titles: title,
    });
    const res = await fetch(`${API}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json", "user-agent": AGENT },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as ExtractResponse;
    const page = Object.values(data.query?.pages ?? {})[0];
    const extract = page?.extract?.trim();
    if (!page || page.missing !== undefined || !extract) return null;

    if (!namesTheTaxon(extract, query.scientificName ?? null, query.commonName)) return null;

    const text = trimArticle(extract);
    // A stub of two lines is not worth a model call or a credit line.
    if (text.length < 200) return null;

    const pageTitle = page.title ?? title;
    return {
      title: pageTitle,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`,
      text,
    };
  } catch {
    return null;
  }
}
