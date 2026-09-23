/**
 * The #305 measurement, runnable.
 *
 *   npx tsx scripts/probe-seasonal.mjs
 *
 * Prints, for a handful of real coordinates, three things side by side:
 *
 *   1. what the hand-typed phenology file says is about this week,
 *   2. what Pointmoon's live observations say,
 *   3. what the GBIF occurrence record says was actually recorded here in
 *      this month, across every year on file.
 *
 * Then, when ANTHROPIC_API_KEY is set, it drafts the teacher-facing line over
 * (3) and shows whether the guard accepted it. No result of this script is
 * cached and nothing it prints reaches a user; it exists so a human can read
 * fifty real retrievals and answer the only question that matters — could a
 * five-year-old find this, here, this week?
 */

import { seasonalSpecies, monthOfYear, isThinCell, SEASONAL_COVERAGE_FLOOR } from "../lib/outside/gbif.ts";
import { checkLookForLine, draftLookForLine } from "../lib/ai/look-for-line.ts";
import { getPhenologyEntries, weekOfYear } from "../lib/outside/phenology.ts";

const PLACES = [
  { label: "Tirana, Albania", lat: 41.3275, lng: 19.8187, region: "western-europe" },
  { label: "Elbasan (rural), Albania", lat: 41.1125, lng: 20.0822, region: "western-europe" },
  { label: "Porto, Portugal", lat: 41.1579, lng: -8.6291, region: "western-europe" },
  { label: "London, England", lat: 51.546, lng: -0.105, region: "uk-south" },
  { label: "Tulsa, Oklahoma", lat: 36.154, lng: -95.993, region: "us-south-central" },
];

const now = new Date();

/** The 550 names the retired files still know, used only to catch invention. */
async function loadLexicon() {
  const { readdir, readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "lib", "outside", "data", "phenology");
  const names = new Set();
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    for (const week of Object.values(data)) {
      for (const entry of week) if (entry.species) names.add(entry.species);
    }
  }
  return [...names];
}

async function pointmoonNearby(lat, lng) {
  try {
    const url =
      `https://pointmoon.ai/api/moon?audience=facts&surface=open&lat=${lat}&lng=${lng}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const snapshot = data?.facts?.fieldSnapshot ?? {};
    return {
      nearby: snapshot.observations?.nearby ?? [],
      phenology: snapshot.phenology ?? null,
    };
  } catch {
    return null;
  }
}

const lexicon = await loadLexicon();
console.log(`Lexicon: ${lexicon.length} species names from the retired files.\n`);

for (const place of PLACES) {
  console.log("=".repeat(78));
  console.log(`${place.label}   week ${weekOfYear(now)}, month ${monthOfYear(now)}`);
  console.log("=".repeat(78));

  const authored = await getPhenologyEntries({
    region: place.region,
    date: now,
    limit: 5,
  });
  console.log(`\n  [1] hand-typed file (${place.region}.json)`);
  for (const entry of authored) {
    console.log(`      ${entry.species} (${entry.narrativePhase ?? "-"})`);
  }
  if (authored.length === 0) console.log("      (nothing)");

  const pm = await pointmoonNearby(place.lat, place.lng);
  console.log(`\n  [2] pointmoon live observations: ${pm ? pm.nearby.length : "unreachable"}`);
  for (const entry of (pm?.nearby ?? []).slice(0, 5)) {
    console.log(`      ${entry.name} (count ${entry.count ?? "?"})`);
  }
  if (pm && pm.nearby.length === 0) console.log("      (nothing recorded near this point)");
  if (pm?.phenology) {
    const names = (pm.phenology.entries ?? []).map((e) => e.species).join(", ");
    console.log(`      pointmoon's own phenology (regionKey ${pm.phenology.regionKey}): ${names}`);
  }

  const seasonal = await seasonalSpecies({ lat: place.lat, lng: place.lng, date: now });
  console.log(`\n  [3] gbif occurrence record: ${seasonal.length} species`);
  // The columns after `n=` are what now decides the ORDER (#312). Printing the
  // count without them would show a list sorted by a key the reader cannot see,
  // which is how the light-trap moths went unnoticed at the top of Porto.
  for (const s of seasonal.slice(0, 10)) {
    const share = `${Math.round(s.monthShare * 100)}%`.padStart(4);
    const f = s.findability;
    const day = f.daylightShare === null ? " n/a" : `${Math.round(f.daylightShare * 100)}%`.padStart(4);
    console.log(
      `      ${s.name.padEnd(30)} ${s.stratum.padEnd(10)} ${s.phase.padEnd(9)}` +
        ` n=${String(s.occurrencesInMonth).padStart(5)} ${share} of its local records` +
        `  | find ${f.score.toFixed(2)}  ${String(f.distinctObservers).padStart(3)} recorders` +
        `  top ${`${Math.round(f.topObserverShare * 100)}%`.padStart(4)}` +
        `  named ${(f.observerCoverage === null ? "n/a" : `${Math.round(f.observerCoverage * 100)}%`).padStart(4)}  daylight ${day}` +
        `${f.lightTrapped ? "  LIGHT-TRAP" : ""}`,
    );
  }
  if (seasonal.length === 0) {
    console.log("      (nothing recorded here this month — the honest answer is to say less)");
  } else if (isThinCell(seasonal)) {
    console.log(
      `      (under the coverage floor of ${SEASONAL_COVERAGE_FLOOR} — a caller shows FEWER here,` +
        ` and never widens the box to reach ten)`,
    );
  }

  if (process.env.ANTHROPIC_API_KEY && seasonal.length > 0) {
    const facts = { species: seasonal.slice(0, 12), lexicon, fallback: "Go outside and see what you notice." };
    const draft = await draftLookForLine(facts);
    console.log(`\n  [4] the line`);
    if (draft) {
      console.log(`      "${draft.line}"   (chose: ${draft.species})`);
    } else {
      console.log(`      declined; the authored fallback renders`);
    }
    // Show the guard doing its job on a deliberately poisoned draft.
    const poisoned = checkLookForLine(
      { species: seasonal[0].name, line: `Look for a ${seasonal[0].name.toLowerCase()} and see if the blackberries are ripe.` },
      facts,
    );
    console.log(`      guard vs an invented blackberry: ${poisoned.ok ? "PASSED (bad)" : `rejected (${poisoned.reason})`}`);
  }
  console.log("");
}
