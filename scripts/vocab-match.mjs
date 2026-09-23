#!/usr/bin/env node
/**
 * VOCABULARY MATCH — a teacher's own key words against our sessions (#563).
 *
 * She already has the list. It is a column in the unit she is planning, and
 * its words are largely downstream of the statutory programme of study every
 * English primary teaches, which is what makes them a join key across schools
 * rather than one school's private index. This is the mapping problem solved
 * from her end instead of ours: we do not have to read four hundred school
 * PDFs to meet her.
 *
 * This is the TOOL, not the surface. The paste-a-list screen is a later
 * ticket, deliberately, so the matcher's hit quality is known before anything
 * is put in front of a teacher. The library underneath is `lib/vocab/`.
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────
 *
 *   npm run vocab:match -- "seed, seeds, coprolite"
 *   npm run vocab:match -- --file my-unit-words.txt
 *   pbpaste | npm run vocab:match
 *   npm run vocab:coverage            # what the index can and cannot see
 *   npm run vocab:match -- --json "seed, frost"
 *
 * Words separate on newlines, commas, semicolons, tabs and pipes — never on
 * spaces, because "leaf litter" and "root hairs" are single terms.
 *
 * ── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *
 * It never rewrites her words. Every word is printed back exactly as it was
 * given, including its case and its punctuation; folding happens inside the
 * comparison and never on the way out.
 *
 * It never pads. A word our glossaries do not carry prints as a miss, and a
 * list with no hits prints an empty result, because that is the true answer
 * and a weak match dressed as a hit costs a teacher a lesson that does not
 * teach her unit.
 *
 * It reads nothing but this repo's own packs. No school's curriculum map, no
 * unit names, no vocabulary list from anybody's planning file, and no synonym
 * table — an equivalence between two different words needs an authority to
 * cite and there is none.
 */

import { readFileSync } from "node:fs";
import { loadVocabIndex } from "../lib/vocab/term-index.ts";
import { distinct, matchVocabulary, splitList } from "../lib/vocab/match.ts";

function readStdin() {
  if (process.stdin.isTTY) return "";
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * Her word, delimited so a leading space or a bullet is visible rather than
 * swallowed by the column. The quotes are furniture around her string; what is
 * inside them is byte for byte what she gave.
 */
function quoted(input) {
  return `"${input}"`;
}

function pct(part, whole) {
  return whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
}

function printCoverage(coverage) {
  const c = coverage;
  console.log("WHAT THE MATCHER CAN SEE");
  console.log(
    `  ${c.sessionsWithTerms} of ${c.sessions} sessions carry glossary terms ` +
      `(${pct(c.sessionsWithTerms, c.sessions)}); ${c.sessionsWithoutTerms} carry none ` +
      `and cannot be reached by any word.`
  );
  console.log(
    `  On the shelf a teacher can reach today: ${c.shelfSessionsWithTerms} of ` +
      `${c.shelfSessions} (${pct(c.shelfSessionsWithTerms, c.shelfSessions)}).`
  );
  console.log(
    `  ${c.distinctTerms} distinct terms indexed, from ${c.termEntries} authored entries ` +
      `across ${c.packs} packs.`
  );
  if (c.wordlessSessionIds.length > 0) {
    console.log("  Sessions with no glossary (invisible to this matcher):");
    for (const id of c.wordlessSessionIds) {
      const onShelf = c.shelfWordlessSessionIds.includes(id) ? "  [on the shelf]" : "";
      console.log(`    - ${id}${onShelf}`);
    }
  }
}

function printMatch(report) {
  const { counts } = report;
  console.log("");
  console.log("YOUR WORDS");
  for (const result of report.terms) {
    // Her string, verbatim. Never trimmed, never cased, never corrected.
    if (result.status === "hit") {
      const where = result.hits
        .map(
          (hit) =>
            `${hit.term} (${hit.kind}) in ${hit.sessions
              .map((s) => s.sessionId)
              .join(", ")}`
        )
        .join("; ");
      console.log(`  HIT   ${quoted(result.input)}  ->  ${where}`);
    } else if (result.status === "near") {
      console.log(`  NEAR  ${quoted(result.input)}  ->  not a match:`);
      for (const near of result.near) {
        console.log(
          `          ${near.because} [${near.kind}] — ` +
            `${near.sessions.map((s) => s.sessionId).join(", ")}`
        );
      }
    } else {
      console.log(`  MISS  ${quoted(result.input)}  ->  no session teaches this word`);
    }
  }

  console.log("");
  console.log(
    `  ${counts.hit} hit, ${counts.near} near, ${counts.miss} miss ` +
      `of ${counts.asked} distinct words asked.`
  );

  console.log("");
  console.log("SESSIONS THAT COVER THEM");
  if (report.sessions.length === 0) {
    console.log("  None. No session in the catalogue teaches any of these words.");
    console.log("  That is the honest answer, not a failure of the tool.");
    return;
  }
  for (const overlap of report.sessions) {
    const { session } = overlap;
    const shelf = session.onShelf ? "" : "  (off the shelf)";
    console.log(
      `  ${session.sessionId} — ${session.sessionTitle} [${session.packId}]${shelf}`
    );
    console.log(`    covers ${distinct(overlap.words)} of your words:`);
    for (const word of overlap.words) {
      console.log(`      ${quoted(word.input)}  ->  ${word.term} (${word.kind})`);
    }
  }
}

function main(argv) {
  const args = [...argv];
  const wantsJson = args.includes("--json");
  const coverageOnly = args.includes("--coverage");
  const fileAt = args.indexOf("--file");
  let raw = "";

  if (fileAt !== -1) {
    const path = args[fileAt + 1];
    if (!path) {
      console.error("--file needs a path.");
      process.exit(2);
    }
    raw = readFileSync(path, "utf8");
    args.splice(fileAt, 2);
  }

  const words = args.filter((arg) => !arg.startsWith("--"));
  if (words.length > 0) raw = `${raw}\n${words.join("\n")}`;
  if (raw.trim() === "" && !coverageOnly) raw = readStdin();

  const index = loadVocabIndex();
  const list = splitList(raw);

  if (coverageOnly || list.length === 0) {
    if (wantsJson) {
      console.log(JSON.stringify(index.coverage, null, 2));
      return 0;
    }
    printCoverage(index.coverage);
    if (!coverageOnly) {
      console.log("");
      console.log("No words given. Pass them as arguments, --file, or on stdin.");
      return 2;
    }
    return 0;
  }

  const report = matchVocabulary(list, index);
  if (wantsJson) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  printCoverage(report.coverage);
  printMatch(report);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
