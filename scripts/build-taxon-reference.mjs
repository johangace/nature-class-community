#!/usr/bin/env node
/**
 * Build the taxon reference: a real photograph and a real iconic taxon for
 * every named species in the regional phenology (#321).
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Johan, 17 August, looking at Përmet: *"so usually around why dont we show
 * those?? dont we have images of a salamander?"*
 *
 * We do. iNaturalist holds 5,500 research-grade, CC0-or-CC-BY photographs of
 * Salamandra salamandra and 22,438 of Hirundo rustica. Nature Class showed a
 * drawn plate for both, and drew the same LEAF for both, because the regional
 * tier carries no `iconicTaxon` and no photograph of any kind. So a swallow, a
 * spider and a salamander rendered as three identical sprouting seedlings.
 *
 * The slot for this was designed and never filled: the photo contract has
 * carried `role: "taxon-reference"` since it was written, meaning "a picture of
 * the species, not of an observation near here", and nothing has ever produced
 * one.
 *
 * ── WHAT IS AND IS NOT AUTHORED HERE ───────────────────────────────────────
 *
 * Nothing. That is the point. This script asks iNaturalist and writes down the
 * answer; it is regenerable, and a wrong entry is fixed by re-running rather
 * than by editing. The phenology file it reads is hand-typed and is on its way
 * out (#305, #320) — this makes its species look like themselves in the
 * meantime, and dies with it.
 *
 * ── TWO CORRECTNESS RULES, BOTH LEARNED BY RUNNING IT ──────────────────────
 *
 * 1. EXACT NAME MATCH, NEVER THE FUZZY SEARCH. `?q=Salamandra salamandra`
 *    returns the Eastern Red-backed Salamander first — Plethodon cinereus, a
 *    North American animal. Taking result[0] would have put the wrong species'
 *    photograph under a European name, which is a worse lie than a blank box.
 * 2. THE TAXON'S OWN `default_photo` IS NOT USABLE. Measured across five
 *    species: cc-by-nc, cc-by-nc, cc-by-sa, cc-by-nc-nd, and one all rights
 *    reserved. Zero of five pass our gate. The photograph has to come from a
 *    licence-filtered OBSERVATION query, which is the same gate Pointmoon
 *    already applies to the nearby tier.
 *
 * Usage: node scripts/build-taxon-reference.mjs [--limit N]
 * Writes: lib/outside/data/taxon-reference.json
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PHENOLOGY_DIR = path.join(ROOT, "lib/outside/data/phenology");
const OUT = path.join(ROOT, "lib/outside/data/taxon-reference.json");

/** iNaturalist asks for under 60 requests a minute. Two calls per species. */
const PAUSE_MS = 1_100;
const LICENCES = "cc0,cc-by";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, attempt = 0) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "nature-class/1.0 (taxon reference builder)" },
      signal: AbortSignal.timeout(40_000),
    });
    if (res.status === 429 && attempt < 4) {
      await sleep(5_000 * (attempt + 1));
      return getJson(url, attempt + 1);
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    if (attempt < 2) {
      await sleep(2_000);
      return getJson(url, attempt + 1);
    }
    return null;
  }
}

/** Every distinct scientific name in the phenology files. */
function scientificNames() {
  const names = new Map();
  for (const file of readdirSync(PHENOLOGY_DIR).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(path.join(PHENOLOGY_DIR, file), "utf8"));
    for (const entries of Object.values(data)) {
      for (const entry of entries) {
        const name = (entry.scientificName ?? "").trim();
        // An entry with no scientific name is a season, not a species:
        // "Autumn Colour", "Dawn Chorus", "First Frost". There is nothing to
        // look up and nothing to photograph, and it keeps the drawn plate.
        if (name && !names.has(name.toLowerCase())) {
          names.set(name.toLowerCase(), { scientificName: name, species: entry.species });
        }
      }
    }
  }
  return [...names.values()];
}

/** The taxon, matched exactly. Null rather than a near miss. */
async function findTaxon(scientificName) {
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(
    scientificName
  )}&per_page=10`;
  const body = await getJson(url);
  const results = body?.results ?? [];
  const wanted = scientificName.toLowerCase();
  const exact = results.find((r) => String(r.name ?? "").toLowerCase() === wanted);
  return exact ?? null;
}

/** A releasable photograph of that taxon, or null. Never a near-enough one. */
async function findPhoto(taxonId) {
  const url =
    `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}` +
    `&photo_license=${LICENCES}&quality_grade=research&photos=true` +
    `&order_by=votes&per_page=1`;
  const body = await getJson(url);
  const observation = body?.results?.[0];
  const photo = observation?.photos?.[0];
  if (!photo?.url || !photo.id) return null;

  const license = String(photo.license_code ?? "").toLowerCase();
  // Belt and braces: the query filtered, and we check anyway. A licence we do
  // not hold is the one failure that cannot be fixed after publication.
  if (license !== "cc0" && license !== "cc-by") return null;

  return {
    url: String(photo.url).replace(/\/(square|small|medium)\./, "/large."),
    role: "taxon-reference",
    creator: observation?.user?.name || observation?.user?.login || undefined,
    attribution: String(photo.attribution ?? "").trim() || "iNaturalist",
    license,
    sourceUrl: `https://www.inaturalist.org/photos/${photo.id}`,
    observationId: observation?.id ? String(observation.id) : undefined,
  };
}

const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const names = scientificNames().slice(0, limit);
console.log(`[taxon-reference] ${names.length} distinct scientific names to resolve`);

const taxa = {};
let withPhoto = 0;
let withTaxonOnly = 0;
let missing = 0;

for (const [i, { scientificName, species }] of names.entries()) {
  const taxon = await findTaxon(scientificName);
  await sleep(PAUSE_MS);

  if (!taxon) {
    missing += 1;
    console.log(`  [${i + 1}/${names.length}] ${scientificName} — NO EXACT MATCH (${species})`);
    continue;
  }

  const photo = await findPhoto(taxon.id);
  await sleep(PAUSE_MS);

  const entry = {
    taxonId: taxon.id,
    iconicTaxon: taxon.iconic_taxon_name ?? null,
    commonName: taxon.preferred_common_name ?? null,
  };
  if (photo) {
    entry.photo = photo;
    withPhoto += 1;
  } else {
    withTaxonOnly += 1;
  }
  taxa[scientificName.toLowerCase()] = entry;

  console.log(
    `  [${i + 1}/${names.length}] ${scientificName} -> ${entry.iconicTaxon ?? "?"}` +
      (photo ? ` + photo (${photo.license})` : " (no releasable photo)")
  );
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source:
        "iNaturalist API v1: /taxa exact name match, then /observations with " +
        `photo_license=${LICENCES}, quality_grade=research, order_by=votes.`,
      note:
        "Generated, never hand-edited. Re-run scripts/build-taxon-reference.mjs " +
        "to correct an entry. A species absent from this file keeps its drawn plate.",
      counts: { resolved: Object.keys(taxa).length, withPhoto, withTaxonOnly, missing },
      taxa,
    },
    null,
    2
  ) + "\n"
);

console.log(
  `\n[taxon-reference] wrote ${OUT}\n` +
    `  resolved ${Object.keys(taxa).length}, with photo ${withPhoto}, taxon only ${withTaxonOnly}, unmatched ${missing}`
);
