#!/usr/bin/env node
/**
 * green-pr-sweep.mjs — which open pull requests are green, ungated, and waiting
 * on nothing but a reader, and for how long have they been waiting?
 *
 * WHY THIS EXISTS (#893)
 *
 * Merge throughput has never been this repository's constraint. Reading is.
 * `merge-pr.mjs` has held a correct, well-argued gate since #535, and on the
 * one night something invoked it against the standing set of open PRs —
 * 2026-09-01, 21:19Z to 01:13Z — fourteen tickets closed in four hours. Every
 * other night the same PRs sit green. #868 and #867 were `CLEAN` with every
 * check green from ~06:50Z on 2026-09-02 and were still open four and a half
 * hours later; #586 waited from 2026-08-27 14:20Z; on the evening of 09-01
 * Johan cleared five by hand at roughly seven-minute intervals, and nothing
 * was wrong with any of them.
 *
 * Nothing was broken on any of those nights. Nothing LOOKED. That is the whole
 * defect, and the number this script exists to put on a screen is the one
 * nobody has ever had: **how long has each green PR been green and unmerged.**
 *
 * THE GATE IS NOT REIMPLEMENTED HERE, AND THAT IS THE DESIGN
 *
 * The obvious way to write this script is to re-derive "is it mergeable" from
 * the API — draft, base, checks, behind-by, labels — and that way is wrong.
 * There would then be two answers to "may this land", they would drift, and
 * the copy that drifts is the one nobody merges through, so nobody would
 * notice until it waved something past the content gate (#823).
 *
 * So the predicate below IS `merge-pr.mjs`'s own `evaluateGates`, imported and
 * called on facts read the same way. This script decides only WHICH pull
 * requests to offer the gate, never whether one may land. And `--merge` does
 * not merge: it spawns `node scripts/merge-pr.mjs <n>` per candidate, which
 * re-reads every fact from GitHub and re-evaluates from scratch before it
 * touches anything. Nothing this file observed is evidence at merge time.
 *
 * `evaluateGates` is called with `wait: true` even though this script never
 * waits. That flag is being used as a CLASSIFIER, not as a behaviour: it is
 * exactly the gate's own judgement about which conditions time alone can fix.
 * A build still running comes back `settling` (ask again in five minutes); a
 * red build, a conflict, a draft, a head behind main and a content gate come
 * back `refused` (asking again changes nothing). A report that cannot tell
 * those apart is a report that trains its reader to skim.
 *
 * REPORT IS THE DEFAULT. That is not timidity — it is what the ticket asked
 * for and what the kill-rule requires. `--merge` is opt-in, per run, typed by
 * whoever is accountable for the run.
 *
 * REST ONLY. `gh pr list` and `gh pr view --json` are GraphQL, and the cloud
 * sessions these sweeps actually run in serve REST and refuse GraphQL with
 * HTTP 403 (#859). Every call here is a `gh api repos/...` argv, and since
 * nc#1206 it is answered by `scripts/github-api.mjs` rather than by a `gh`
 * binary: the same cloud sessions carry a token and no `gh` on PATH, so this
 * sweep used to die on `spawnSync gh ENOENT` before listing a single pull
 * request. The argv shape survives because every call site and every test
 * speaks it; only the transport underneath changed.
 *
 * THERE IS NO SCHEDULE, AND THERE IS NO WORKFLOW FILE. #893 says so in as many
 * words: this is a script a shift step calls, not a new orchestrator. See
 * CONTRIBUTING.md, "The green-PR sweep", for the line a shift runs.
 *
 * Run it:
 *   npm run sweep:green                    the report (default; merges nothing)
 *   npm run sweep:green -- --json          the same rows, machine-readable
 *   npm run sweep:green -- --stale-hours 4 shout about PRs green longer than that
 *   npm run sweep:green -- --merge         offer EVERY candidate to merge-pr.mjs
 *
 * `--merge` offers every row the gate would merge, not only the ones the report
 * shouted about. `--stale-hours` moves which rows are printed as JAMMED and
 * nothing else — it is not a merge filter, and reading it as one would be
 * reading a threshold into `--merge` that is not there. "Merge everything the
 * gate would merge" is the deliberate default: the age of a green PR is a fact
 * for the reader, never a condition the gate consults.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ghApiSync } from "./github-api.mjs";
import {
  BUILD_CHECK,
  IDENTITY_CHECK,
  MERGEABLE_CHECK,
  REPO,
  closingTicketRefs,
  evaluateGates,
  latestCheckRun,
  readPullRequestCommits,
  readTicket,
} from "./merge-pr.mjs";

/**
 * One hour. Below this a green PR is not a jam, it is a build cycle: `build`
 * takes ~2m35s (#594) and the person who pushed is usually still at the
 * keyboard. Above it nobody is coming — the measured jams were four and a half
 * hours (#868/#867 on 09-02) and five days (#586, from 08-27 14:20Z), and even
 * the hand-cleared evening of 09-01 moved at seven minutes a PR.
 *
 * A threshold, not a gate. Everything green is listed either way; this only
 * decides which rows the report shouts about. In particular `--merge` does NOT
 * consult it — it offers every candidate, including one green for fifteen
 * seconds. Nothing in this file filters a merge by age.
 */
export const STALE_GREEN_HOURS = 1;

export const USAGE =
  "Usage: node scripts/green-pr-sweep.mjs [--json] [--merge] [--stale-hours N]\n" +
  "  --stale-hours N  which rows print as JAMMED (display only; --merge ignores it)\n" +
  "  --merge          offer EVERY candidate the gate would merge to merge-pr.mjs";

/** Where mergeable=null is re-read from, and how often. See collectFacts. */
export const MERGEABILITY_RETRIES = 2;
export const MERGEABILITY_RETRY_MS = 2000;

const HERE = dirname(fileURLToPath(import.meta.url));
export const MERGE_SCRIPT = join(HERE, "merge-pr.mjs");

/**
 * One GitHub read, in `gh api` argument shape, over REST (nc#1206).
 *
 * `merge-pr.mjs` reads the same endpoints the same way; the two must not be
 * able to disagree about a fact, and they now cannot disagree about how the
 * fact is fetched either. The buffer default matters here as much as it does
 * there: `compare` and `check-runs` on a busy head are megabytes, and Node
 * kills a child whose stdout passes the cap rather than truncating it.
 */
function gh(args) {
  return ghApiSync(args);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * When this check LAST STOPPED being red, in epoch ms: the `completed_at` of
 * the OLDEST run in the unbroken run of successes ending at the newest run, or
 * null if the newest run is not a completed success.
 *
 * Walking back rather than taking the newest run is the whole point. Re-running
 * checks on an unchanged SHA creates a new check-run, and `latestCheckRun`
 * (rightly) prefers it — so reading the clock off the newest run meant that
 * re-running CI RESET the green clock. Measured on this script before the fix:
 * a PR green from 06:50Z read 9h17m at 16:00Z, and 0h57m after a 15:00Z re-run
 * of the same commit. That number is the one thing #893 exists to surface, and
 * a reader who re-runs a check to see it pass would have erased the jam they
 * were looking at.
 *
 * A red run in between correctly restarts the streak: red at 08:00Z then green
 * at 15:00Z means the head was NOT green from 06:50Z, and saying so would be
 * the same lie in the other direction.
 */
export function successStreakStart(checkRuns, name) {
  const runs = (checkRuns ?? [])
    .filter((run) => run.name === name)
    .slice()
    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));

  let earliest = null;
  for (const run of runs) {
    if (run.status !== "completed" || run.conclusion !== "success") break;
    const ms = Date.parse(run.completed_at ?? "");
    if (Number.isFinite(ms)) earliest = ms;
  }
  return earliest;
}

/**
 * The moment this head became green, in epoch ms, or null if it is not green.
 *
 * "Green" is the same claim `merge-pr.mjs` makes and no larger: `build`
 * concluded success, and `mergeable` and `identity` either concluded success or
 * do not exist on this head at all (the documented fallback for PRs predating
 * pr-merge-check.yml, and the same tolerance for commit-identity.yml). The
 * timestamp is the LATER of the ones present, because the PR was not green
 * until the last required check said so.
 *
 * The gate itself is STRICTER than this about an absent `identity` — it refuses,
 * because nothing else reads the git author field (#958). That difference costs
 * an age on a row whose verdict is already `refused`, never a candidacy: the row's
 * verdict is `evaluateGates`', not this function's. What this must never do is
 * call a head with a RED identity green, which is the case it now reads.
 *
 * Each check contributes the start of its own success streak, not its newest
 * run, so a re-run on an unchanged SHA does not reset the clock — see
 * `successStreakStart` for the number that cost.
 *
 * Deliberately not "when the PR was opened" and not "when the head was pushed":
 * the ticket's number is time spent green and unread, and a PR that spent three
 * of its four hours building was not waiting on a reader for those three.
 *
 * One residual, and it is a floor rather than a fiction: this reads a single
 * 100-run page of check-runs, so if a head ever accumulated more than that, the
 * oldest runs of the streak fall off the page and the age reported is younger
 * than the truth. It can under-state a jam; it cannot invent one.
 */
export function greenSince(checkRuns) {
  const build = latestCheckRun(checkRuns, BUILD_CHECK);
  if (!build || build.status !== "completed" || build.conclusion !== "success") return null;

  const mergeCheck = latestCheckRun(checkRuns, MERGEABLE_CHECK);
  if (mergeCheck && (mergeCheck.status !== "completed" || mergeCheck.conclusion !== "success")) {
    return null;
  }

  const identity = latestCheckRun(checkRuns, IDENTITY_CHECK);
  if (identity && (identity.status !== "completed" || identity.conclusion !== "success")) {
    return null;
  }

  const stamps = [
    successStreakStart(checkRuns, BUILD_CHECK),
    mergeCheck ? successStreakStart(checkRuns, MERGEABLE_CHECK) : null,
    identity ? successStreakStart(checkRuns, IDENTITY_CHECK) : null,
  ].filter((ms) => ms != null && Number.isFinite(ms));
  return stamps.length > 0 ? Math.max(...stamps) : null;
}

/**
 * One pull request's row: is it a candidate, why not if not, and how long has
 * it been green.
 *
 * The verdict is `evaluateGates`' verdict, renamed for a report and not
 * otherwise touched:
 *
 *   offer     the gate returned `merge` on these facts — hand it to merge-pr.mjs
 *   settling  the gate is waiting on something time fixes (a build in flight,
 *             mergeability GitHub has not computed yet)
 *   refused   the gate refuses, and will keep refusing until someone acts:
 *             draft, wrong base, red build, conflict, behind main, content gate
 */
export function classifyPullRequest(facts, { now = Date.now(), staleAfterMs } = {}) {
  const threshold = staleAfterMs ?? STALE_GREEN_HOURS * 60 * 60 * 1000;
  const gate = evaluateGates({ ...facts, wait: true, waitExpired: false });

  const since = greenSince(facts.checkRuns);
  const greenForMs = since == null ? null : Math.max(0, now - since);

  const status = gate.verdict === "merge" ? "offer" : gate.verdict === "wait" ? "settling" : "refused";

  return {
    number: Number(facts.prNumber),
    title: facts.title ?? "",
    headSha: facts.headSha ?? null,
    headRef: facts.headRef ?? null,
    url: `https://github.com/${REPO}/pull/${facts.prNumber}`,
    status,
    reason: status === "offer" ? null : (gate.reason ?? gate.waitingFor ?? null),
    closes: (facts.linkedIssues ?? []).map((issue) => issue.number),
    greenSince: since == null ? null : new Date(since).toISOString(),
    greenForMs,
    /** Green, offerable, and past the threshold: this row is the jam (#893). */
    stale: status === "offer" && greenForMs != null && greenForMs >= threshold,
  };
}

/** The open pull requests, over REST (`gh pr list` is GraphQL and 403s — #859). */
export function listOpenPullRequests({ api = gh } = {}) {
  return JSON.parse(api(["api", `repos/${REPO}/pulls?state=open&per_page=100`]));
}

/**
 * Everything the gate judges for one PR, read the same way `merge-pr.mjs` reads
 * it — same endpoints, same `readTicket` for labels, so the two cannot disagree
 * about what a fact is.
 *
 * Identity gates short-circuit. A draft, a closed PR or one aimed somewhere
 * other than main is refused by `evaluateGates` on the pull payload alone, and
 * spending a compare plus a check-runs call to reach that same refusal would
 * triple the API cost of a sweep across a board full of drafts.
 *
 * `mergeable` is re-read rather than waited on. GitHub computes it lazily and
 * the first GET is what triggers the computation, so a cold PR reads null once
 * and true a moment later; `merge-pr.mjs` sits through five 3s naps for this,
 * which is right for one merge and wrong for a scan of twenty PRs. Two short
 * retries, then the row honestly says `settling`.
 */
export function collectFacts(pr, { api = gh, sleep = sleepSync } = {}) {
  const base = {
    prNumber: pr.number,
    title: pr.title,
    // The body and the commits are the two texts a merge closes tickets from
    // (#983, #995). The header above promises this predicate IS the merge
    // gate's; feeding it less than the gate reads is how the two come to
    // disagree about whether a PR can land.
    body: pr.body ?? "",
    commits: null,
    commitCount: null,
    prState: pr.state,
    baseRef: pr.base?.ref,
    headRef: pr.head?.ref,
    draft: Boolean(pr.draft),
    headSha: pr.head?.sha,
    mergeable: pr.mergeable ?? null,
    mergeableState: pr.mergeable_state ?? null,
    behindBy: 0,
    checkRuns: [],
    linkedIssues: [],
  };
  if (base.prState !== "open" || base.baseRef !== "main" || base.draft) return base;

  let detail = pr;
  for (let i = 0; detail.mergeable == null && i < MERGEABILITY_RETRIES; i++) {
    if (i > 0) sleep(MERGEABILITY_RETRY_MS);
    detail = JSON.parse(api(["api", `repos/${REPO}/pulls/${pr.number}`]));
  }

  const headSha = detail.head?.sha ?? base.headSha;
  const cmp = JSON.parse(api(["api", `repos/${REPO}/compare/main...${headSha}`]));
  const runs = JSON.parse(
    api(["api", `repos/${REPO}/commits/${headSha}/check-runs?per_page=100`]),
  ).check_runs;

  return {
    ...base,
    title: detail.title ?? base.title,
    body: detail.body ?? base.body,
    headSha,
    mergeable: detail.mergeable ?? null,
    mergeableState: detail.mergeable_state ?? null,
    behindBy: cmp.behind_by,
    commits: readPullRequestCommits(pr.number, { api }),
    commitCount: detail.commits ?? null,
    checkRuns: runs,
    linkedIssues: closingTicketRefs({ title: detail.title, body: detail.body }).map((number) =>
      readTicket(number, { api }),
    ),
  };
}

/** The whole sweep: every open PR, classified. Report only — merges nothing. */
export function sweep({ api = gh, now = Date.now(), staleAfterMs, sleep = sleepSync } = {}) {
  const rows = listOpenPullRequests({ api })
    .map((pr) => classifyPullRequest(collectFacts(pr, { api, sleep }), { now, staleAfterMs }))
    .sort((a, b) => (b.greenForMs ?? -1) - (a.greenForMs ?? -1) || a.number - b.number);
  return { rows, now, staleAfterMs: staleAfterMs ?? STALE_GREEN_HOURS * 60 * 60 * 1000 };
}

/**
 * "5d21h" / "4h30m" / "42m" — a span a reader can feel.
 *
 * Not `merge-pr.mjs`'s `formatDuration`, which stops at minutes because it was
 * written for a 15-minute wait budget: through it, the four and a half hours
 * #868 sat green reads "270m00s" and the five days #586 waited reads
 * "7200m00s". Those are the two numbers this whole report is for, and a reader
 * who has to divide by sixty to feel them will not feel them.
 */
export function formatAge(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(hours / 24)}d${String(hours % 24).padStart(2, "0")}h`;
}

/** "green 4h30m" / "not green" — the column the ticket is actually about. */
export function formatGreenFor(row) {
  if (row.greenForMs == null) return "not green";
  return `green ${formatAge(row.greenForMs)}`;
}

export function formatReport(result) {
  const { rows, staleAfterMs } = result;
  const lines = [];
  const offers = rows.filter((row) => row.status === "offer");
  const stale = offers.filter((row) => row.stale);

  lines.push(`Green-PR sweep of ${REPO} — ${rows.length} open pull request(s).`);
  lines.push("");

  for (const row of rows) {
    const mark =
      row.status === "offer"
        ? row.stale
          ? "JAMMED"
          : "ready "
        : row.status === "settling"
          ? "settle"
          : "held  ";
    const indent = " ".repeat(8);
    lines.push(`${mark}  #${row.number}  ${formatGreenFor(row)}  ${row.title}`);
    if (row.closes.length > 0) {
      lines.push(`${indent}closes ${row.closes.map((n) => `#${n}`).join(", ")}`);
    }
    if (row.reason) lines.push(`${indent}${row.reason}`);
    lines.push(`${indent}${row.url}`);
  }

  lines.push("");
  lines.push(
    `${offers.length} candidate(s) the gate would merge right now; ${stale.length} of them ` +
      `green for more than ${formatAge(staleAfterMs)} — that is the reading jam (#893).`,
  );
  if (offers.length > 0) {
    lines.push(
      "Nothing here merged anything. Offer them to the gate with " +
        "`npm run sweep:green -- --merge`, which runs scripts/merge-pr.mjs per PR " +
        "and re-checks every condition from fresh facts.",
    );
    lines.push(
      `That offers all ${offers.length} candidate(s) above, not just the ${stale.length} ` +
        "marked JAMMED — the age column is for you, not for the gate.",
    );
  }
  return lines.join("\n");
}

/**
 * Hand ONE pull request to the real gate. Not a merge call: a child process
 * running `merge-pr.mjs`, which re-reads every fact and can still refuse.
 *
 * It will refuse, routinely and correctly, after the first merge of a pass:
 * landing one PR puts every other open head one commit behind main, and being
 * behind main is a refusal this script has no business arguing with. A sweep
 * therefore lands what is up to date at the moment it runs and names the rest;
 * rebasing is somebody else's job and deliberately not this script's.
 */
export function offerToGate(prNumber, { spawn = spawnSync, node = process.execPath } = {}) {
  const result = spawn(node, [MERGE_SCRIPT, String(prNumber)], { stdio: "inherit" });
  if (result.error) throw result.error;
  return { number: Number(prNumber), merged: result.status === 0, exitCode: result.status };
}

export function parseArgs(argv) {
  const json = argv.includes("--json");
  const merge = argv.includes("--merge");
  const at = argv.indexOf("--stale-hours");
  let staleHours = STALE_GREEN_HOURS;
  if (at !== -1) {
    const value = Number(argv[at + 1]);
    if (!Number.isFinite(value) || value < 0) return { usageError: true };
    staleHours = value;
  }
  const unknown = argv.filter(
    (arg, i) =>
      arg.startsWith("--") &&
      !["--json", "--merge", "--stale-hours"].includes(arg) &&
      argv[i - 1] !== "--stale-hours",
  );
  if (unknown.length > 0) return { usageError: true };
  return { json, merge, staleAfterMs: staleHours * 60 * 60 * 1000 };
}

function main(argv) {
  const { json, merge, staleAfterMs, usageError } = parseArgs(argv);
  if (usageError) {
    console.error(USAGE);
    return 2;
  }

  const result = sweep({ staleAfterMs });

  if (json) {
    console.log(JSON.stringify({ ...result, generatedAt: new Date(result.now).toISOString() }, null, 2));
  } else {
    console.log(formatReport(result));
  }

  if (!merge) return 0;

  const candidates = result.rows.filter((row) => row.status === "offer");
  if (candidates.length === 0) {
    console.log("\n--merge: no candidates to offer.");
    return 0;
  }

  console.log(
    `\n--merge: offering all ${candidates.length} candidate(s) to scripts/merge-pr.mjs, one at a ` +
      "time — every row the gate would merge, regardless of how long it has been green.",
  );
  const outcomes = [];
  for (const row of candidates) {
    console.log(`\n--- merge-pr.mjs #${row.number} ---`);
    outcomes.push(offerToGate(row.number));
  }
  const merged = outcomes.filter((o) => o.merged).map((o) => `#${o.number}`);
  const refused = outcomes.filter((o) => !o.merged).map((o) => `#${o.number}`);
  console.log(
    `\nmerged ${merged.length} (${merged.join(", ") || "none"}); ` +
      `the gate refused ${refused.length} (${refused.join(", ") || "none"}) — ` +
      "a refusal here is the gate working, most often because an earlier merge in this " +
      "pass put the head behind main. Rebase and run again.",
  );
  /*
   * Exit 0 even when the gate refused. A refusal is a fact about a PR, not a
   * failure of the sweep, and a non-zero exit would let a shift step or a hook
   * quietly promote this report into a blocking check — which is precisely the
   * new orchestrator #893 forbids.
   */
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
