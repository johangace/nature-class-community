#!/usr/bin/env node
/**
 * Commit identity: who a commit SAYS wrote it (#834).
 *
 * NOT `scripts/authorship.mjs`. That file answers "did Johan write this
 * STRING", by holding a pack's text against the source rows it was ported
 * from, so a house style rule cannot edit the founder's curriculum. This one
 * answers "did Johan write this COMMIT", by reading `%(authorname)` and
 * `%(authoremail)` off the commit range a pull request is asking to merge. Two
 * different provenances, deliberately two different files, and neither one is
 * a substitute for the other.
 *
 * WHY THIS EXISTS
 *
 * #361 is the honest failure. A commit authored `Claude <noreply@anthropic.com>`
 * fails the CLA check, gets caught in the open, and gets re-authored. That path
 * has run twice (#622, #831) and it cost a re-author, not a rule.
 *
 * This is the silent one. Some agent branches carry commits authored
 * `johan gace <gace.johan3@gmail.com>` — the founder's own local git identity,
 * borrowed rather than declared. That authorship:
 *
 *   - PASSES the CLA check, because `johangace` is on its allowlist;
 *   - PASSES the merge gate, which reads no authorship at all;
 *   - and makes an agent branch indistinguishable from Johan's own in
 *     `git log`.
 *
 * #806 allowlisted `Codex <noreply@openai.com>` — the identity Codex DECLARES.
 * Nothing touched the one it BORROWS, and nothing in that path derives an
 * identity, so the borrowed name kept sailing through every gate this repo has.
 *
 * Provenance is load-bearing here, not cosmetic. Office rules distinguish
 * agent-authored work from founder-authored work — an agent-authored constraint
 * must never carry the founder's name — and `johan-gated` decisions turn on WHO
 * wrote a thing. A gate that cannot tell the founder from an agent wearing his
 * name cannot enforce any of that, and neither can a human reading `git log`
 * six months later.
 *
 * WHAT IT ASSERTS
 *
 * On a branch this repo recognises as automated, no commit may claim a founder
 * identity. Every commit in the range is read, not just the pull request's
 * author, because the PR author is a GitHub account and the thing being
 * laundered is the git author field, which GitHub never looks at.
 *
 * WHY THE SCOPE IS BRANCH-SHAPED, AND WHY THAT IS THE HONEST LINE
 *
 * Johan's own branches may carry Johan's identity. That is not a loophole to be
 * closed; it is the truth, and a check that refused it would be wrong and would
 * be switched off within a week. So the refusal is scoped to branches whose
 * name says an automated worker created them (`codex/`, `claude/`, `agent/`),
 * plus commits that DECLARE an agent in their own trailers while claiming the
 * founder in their author field.
 *
 * That scope is a convention, and it should be said plainly that a convention
 * is what it is. An agent that pushes to `fix/…` or `research/…` is not caught
 * here. Nothing in a commit object distinguishes a human at a keyboard from a
 * worker with the same `user.email`, so no check can do better than the markers
 * that exist. What this closes is the path automation actually takes in this
 * repository — every branch a worker opens here is prefixed, and the night loop
 * pins one — and it closes it loudly. The remaining surface is named in
 * `docs/agent-identity-audit-2026-09-01.md` rather than implied to be covered.
 *
 * RULE 2, AND THE FALSE POSITIVE IT USED TO PRODUCE (#851)
 *
 * Rule 2 originally read: founder in the author field, plus an agent named in
 * the trailers, anywhere. The stated premise was that such a commit "is
 * contradicting itself". That premise is wrong for `Co-Authored-By:`, which
 * asserts SHARED authorship — Johan wrote it, Claude helped. That is the honest
 * arrangement and this repository's own attribution convention MANDATES the
 * trailer for it. So rule 2 refused the founder's own Claude-assisted commits,
 * and its remedy told him to re-author them as `rewyld-claude[bot]`: a worse
 * provenance lie than the one being prevented.
 *
 * The fix is not to delete rule 2 but to give it the discriminator it was
 * missing. A commit has TWO identities, not one. `--author=` sets the first;
 * only the hand actually running `git commit` sets the second. So:
 *
 *   author = founder, committer = founder, trailer names an agent
 *       -> Johan committed it himself and credited his tooling. HONEST. PASS.
 *   author = founder, committer = someone else, trailer names an agent
 *       -> the founder's name is on a commit the founder did not make, and the
 *          commit itself says an agent was involved. REFUSE.
 *
 * This is a COHERENCE check, not a security boundary, and the difference is
 * worth stating rather than glossing. An agent that exports GIT_COMMITTER_* as
 * well as GIT_AUTHOR_* defeats rule 2 — but such an agent also defeated the OLD
 * rule 2 by deleting one trailer line, so no coverage against a determined
 * launderer is given up here. What rule 2 catches, before and after, is an
 * agent that is honest in its trailers and dishonest in its author field. All
 * this change adds is the requirement that it also be dishonest about the hand
 * on the keyboard, which is what separates it from Johan. Rule 1 is untouched
 * and remains the load-bearing rule: on every branch automation opens in this
 * repository, a borrowed founder identity is refused whatever the trailers say
 * and whoever the committer is.
 *
 * A MISSING committer counts as "not the founder". Unknown is not a pass
 * (nc#535), and both ingest paths below always populate the field.
 *
 * WHAT THE RANGE IS, AND WHY IT IS NOT "EVERY COMMIT CI HANDS US" (#949)
 *
 * The local invocation reads `origin/main..HEAD`: the commits the BRANCH
 * contributed. The CI invocation reads GitHub's `pulls/:n/commits`, which is a
 * LIST rather than a range — for a branch that merged `main` into itself it
 * carries `main`'s commits too, back to the merge base.
 *
 * That is not a cosmetic difference. `main`'s history is overwhelmingly the
 * shape both rules refuse, and structurally so: a GitHub squash merge stamps
 * `author: johan gace`, `committer: GitHub <noreply@github.com>`, and a message
 * concatenating the branch's commit messages — agent trailers included. At the
 * time of writing, 244 of `main`'s 612 commits are that shape. So the first
 * agent branch to merge `main` instead of rebasing would have been refused on
 * 244 commits nobody on that branch wrote, all of them already merged, with a
 * remedy ("re-author") that cannot be applied to `main`'s history. The only
 * available responses would be `--no-verify` or ignoring the check, which is
 * how a guard stops being read.
 *
 * So the range is narrowed to what the branch actually contributed: any commit
 * REACHABLE FROM THE BASE is dropped before judgement (`--base-sha`, and see
 * `partitionByBase`). The discriminator is base-reachability and deliberately
 * nothing else:
 *
 *   - It cannot hide a branch commit. A commit the branch contributed is by
 *     definition not reachable from the base, whatever else is in the range —
 *     including when a merge of `main` sits beside it, and including the merge
 *     commit itself, which the branch created and the base has never seen.
 *   - "Skip a merge's second-parent history" would have been the cheaper
 *     mechanism and is a HOLE: merge a side branch carrying a borrowed identity
 *     and its commits vanish from the range. Reachable-from-base does not have
 *     that property, because a side branch is not on the base either.
 *   - A commit already on the base is already merged. There is no laundering
 *     left to prevent there, and the branch under judgement did not do it.
 *
 * The two ingest paths now agree by construction rather than by coincidence:
 * `origin/main..HEAD` IS "reachable from HEAD, not reachable from main", and
 * the REST path subtracts the same set explicitly. If the base's commits cannot
 * be listed (a shallow checkout, a missing object), the whole range is judged
 * and the report says so — noisy, never silent, which is the safe direction.
 *
 * AND WHY THE BASE ITSELF IS CHECKED BEFORE IT IS TRUSTED (#976)
 *
 * `--base-sha` names the set that gets SUBTRACTED, so it is the one input to
 * this check that can make it judge less. `partitionByBase` was already careful
 * about its OUTPUT — a base SHA that is not full-length is dropped, because a
 * prefix guess that went wrong drops a commit from the guard — and the INPUT
 * was not checked at all. Two values switched the whole guard off, silently and
 * green:
 *
 *   --base-sha <the branch's own head>  everything in the payload is reachable
 *       from it, so everything is subtracted: `0 commit(s)`, exit 0.
 *   --base-sha --all                    an option-shaped ref reaches
 *       `git rev-list` as an OPTION. `--all` walks every ref, which again
 *       subtracts the whole payload.
 *
 * Neither is reachable today — in CI the value is
 * `github.event.pull_request.base.sha`, which GitHub populates and which is
 * always 40 hex, and `pull_request_target` means a head branch can change
 * neither this script nor the workflow that passes it. This is defence in depth
 * on a guard whose whole job is defence in depth, and the shape of the failure
 * is why it is worth having: a second caller, a `workflow_dispatch` input, or
 * an operator pasting a ref would not go red, it would go GREEN.
 *
 * Three things answer it, and the direction of failure is the same in all
 * three — subtract NOTHING, say why, and judge the FULL range, which is
 * over-inclusive and noisy rather than silent and clean:
 *
 *   - the value must BE a commit SHA (`assertBaseSha`). A ref name is not a
 *     base; nothing legitimate passes one here.
 *   - `shasReachableFrom` peels `<ref>^{commit}`, so even if something reaches
 *     it unvalidated, git cannot read an option-shaped ref as an option.
 *   - a base that subtracts EVERYTHING is not a base. A non-empty payload with
 *     nothing left to judge is a failed subtraction, not a clean range — the
 *     nc#535 rule again: unknown is not a pass — so the subtraction is
 *     discarded and the whole range judged.
 *
 * AN UNIDENTIFIABLE BRANCH IS JUDGED AS AUTOMATED (#851)
 *
 * `--branch ""`, and the `HEAD` that `rev-parse --abbrev-ref` returns from a
 * detached checkout, used to report "not an agent branch" and exit 0 — a silent
 * pass with a borrowed identity sitting in the range. Same nc#535 rule as the
 * empty-payload refusal below: a branch this cannot name is a branch it cannot
 * clear, so rule 1 applies as though it were an agent's. A clean range still
 * goes green; only a borrowed founder identity in an unnameable range refuses.
 *
 * SCOPE (see scripts/authorship.mjs's audit table): NEITHER house nor founder
 * writing. It reads commit metadata. It quotes no prose and edits nothing.
 *
 * RUNNING IT
 *
 *   node scripts/commit-identity-check.mjs
 *       the branch you are on, against `origin/main..HEAD`
 *
 *   node scripts/commit-identity-check.mjs --branch codex/826-x --range main..codex/826-x
 *
 *   node scripts/commit-identity-check.mjs --branch <ref> --commits-json <file> \
 *       --base-sha <base sha>
 *       the shape GitHub's REST `pulls/:n/commits` returns. This is what CI
 *       uses: the workflow reads the range off the API and never fetches, let
 *       alone runs, the head branch's code. `--base-sha` is the pull request's
 *       base commit, and everything reachable from it is dropped from the range
 *       before judgement (#949) — the subtraction `origin/main..HEAD` performs
 *       for free on the local path.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Who the founder is
// ---------------------------------------------------------------------------

/**
 * Every identity that means "Johan" in this repository's history.
 *
 * Both are real and both appear on `main`: the first is his local git config,
 * which is the one Codex borrows; the second is the identity GitHub stamps on a
 * squash merge made from the web. Listing only the first would leave the other
 * available to borrow the moment anyone noticed.
 *
 * Emails, not names. A name is free text — `johan gace`, `Johan`, `Johan Gace`
 * are all in the log already — so matching on it would be a spelling contest.
 * The email is what git actually keys an identity on, what GitHub resolves to
 * an account, and what the CLA allowlist is really about.
 */
export const FOUNDER_EMAILS = [
  "gace.johan3@gmail.com",
  "45638957+johangace@users.noreply.github.com",
];

/**
 * Branch prefixes this repository issues to automated workers.
 *
 * These are the prefixes automation CREATES today: Codex opens `codex/<issue>-…`,
 * the night loop pins `claude/night-<repo>-<slug>-<issue>`, and `agent/…`
 * predates both. The persona prefixes in the August history (`edison/`,
 * `eiffel/`, `monet/`, `tesla/`, `nightingale/`, `atlas/`, `beethoven/`,
 * `smith/`, `signalman/`, `cio/`) were also agent branches, and they are
 * deliberately NOT here: nothing creates them any more, and a list that grows
 * by guessing at names would eventually refuse a person who happened to pick
 * one. They are enumerated in the audit instead, where a stale fact is
 * harmless.
 */
export const AGENT_BRANCH_PREFIXES = ["codex/", "claude/", "agent/"];

/**
 * Trailers by which a commit declares an agent had a hand in it.
 *
 * This is the second rule's FIRST half. It does not depend on a branch name at
 * all. On its own it is not an accusation — see `inspectRange` for the second
 * half, which is the part that makes the pair a contradiction rather than a
 * disclosure. Rule 2 would not have caught the #834 instances — those carry no
 * trailers — so it is a supplement, never the reason to relax the first rule.
 */
const AGENT_TRAILER_PATTERNS = [
  /^co-authored-by:\s*(claude|codex|copilot)\b/im,
  /^co-authored-by:.*<noreply@(anthropic\.com|openai\.com)>/im,
  /generated with \[?(claude code|codex)/i,
];

/**
 * Commits allowed to claim a founder identity on an agent branch anyway, with
 * the reason, keyed by full SHA.
 *
 * This exists because the alternative is worse. Johan does push a fixup onto an
 * agent's branch, and a guard with no recorded way to say "yes, that one really
 * was him" is a guard that gets deleted the first Saturday it is inconvenient.
 * An entry here is a claim on the record with a name attached, which is the
 * thing the check is trying to protect in the first place.
 *
 * There is deliberately NO staleness ratchet on this map, unlike
 * `register-lint.mjs`'s exceptions. That one judges a fixed corpus, so an
 * exception that no longer matches anything is provably dead. This one judges
 * whatever range a pull request happens to carry, so "not present" is the
 * normal case for almost every entry on almost every run, and failing on it
 * would make the map unusable.
 *
 * Empty on purpose at the time of writing: the branches currently carrying
 * borrowed identities are unmerged, so none of them is asking to land. The
 * remedy for each is re-authorship at the point of revival — see the audit —
 * not a blanket exception written in advance.
 *
 * @type {Map<string, string>}
 */
export const RECORDED_EXCEPTIONS = new Map([]);

// ---------------------------------------------------------------------------
// The judgement
// ---------------------------------------------------------------------------

const norm = (value) => String(value ?? "").trim().toLowerCase();

/** Is this identity the founder's? Compared on the email, case-insensitively. */
export function isFounderIdentity(identity) {
  return FOUNDER_EMAILS.includes(norm(identity?.email));
}

/** Strip the shapes a ref arrives in down to a bare branch name. */
function bareRef(ref) {
  return String(ref ?? "")
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "");
}

/**
 * Could this caller not tell us which branch it is judging?
 *
 * Two shapes mean that. `""` is an absent `--branch`. `HEAD` is what
 * `git rev-parse --abbrev-ref HEAD` returns from a detached checkout, which is
 * a branch name nobody has, not the name of the branch being pushed (#851).
 */
export function isUnknownRef(ref) {
  const name = bareRef(ref);
  return name === "" || name === "HEAD";
}

/**
 * Is this a branch an automated worker opened?
 *
 * Tolerates the shapes a ref arrives in — `refs/heads/codex/x`, `origin/codex/x`,
 * `codex/x` — because the caller is sometimes a workflow, sometimes a person
 * pasting what `git branch --show-current` printed.
 *
 * Compared case-insensitively: git refs are case-sensitive, so `Codex/826-x` is
 * a different branch from `codex/826-x` and used to walk straight past this
 * (#851). Case-folding costs nothing and removes a one-keystroke evasion. It
 * cannot stop a determined evader, who renames the branch entirely — that
 * surface is named in the audit, not implied to be covered.
 */
export function isAgentBranch(ref) {
  const name = bareRef(ref).toLowerCase();
  return AGENT_BRANCH_PREFIXES.some((prefix) => name.startsWith(prefix.toLowerCase()));
}

/** Does this commit message declare that an agent had a hand in the commit? */
export function declaresAgent(message) {
  const text = String(message ?? "");
  return AGENT_TRAILER_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * The subject GitHub's branch-update writes, and the address it commits as.
 *
 * `PUT /repos/:repo/pulls/:n/update-branch` — the green "Update branch" button
 * on the pull request page — merges the base into the head and authors the
 * merge commit as THE TOKEN'S identity. For anything acting on Johan's behalf
 * that is the founder, so the commit lands on an agent branch claiming his name
 * and rule 1 refuses it, correctly (#958, hit on #939 and #944).
 *
 * It is worth naming separately because the generic remedy is wrong for it.
 * Nobody typed this commit; a button made it, and it carries no work of its own
 * — so the answer is to drop the merge and rebase, not to re-author a merge
 * commit. Both halves are required: the subject shape alone is an ordinary
 * local `git merge main`, which a person's own identity would sit on.
 */
const MERGE_INTO_SUBJECT = /^Merge branch '[^']+'(?: of \S+)? into \S/;
const GITHUB_COMMITTER_EMAIL = "noreply@github.com";

export function isUpdateBranchMerge(commit) {
  const subject = (
    commit?.subject ?? String(commit?.message ?? "").split("\n")[0] ?? ""
  ).trim();
  if (!MERGE_INTO_SUBJECT.test(subject)) return false;
  return norm(commit?.committer?.email) === GITHUB_COMMITTER_EMAIL;
}

/**
 * Split a range into what the branch contributed and what was already on base.
 *
 * `baseShas` absent (or empty) means "nothing to subtract" — every existing
 * caller, and the local `origin/main..HEAD` path, where git already did this.
 *
 * The set is compared on the full SHA, lowercased, because GitHub's REST
 * payload and `git rev-list` agree on that and on nothing shorter: an
 * abbreviated SHA would make the subtraction a prefix guess, and a wrong guess
 * here DROPS a commit from the guard.
 */
export function partitionByBase(commits, baseShas) {
  const base = new Set(
    [...(baseShas ?? [])].map((sha) => norm(sha)).filter((sha) => /^[0-9a-f]{40}$/.test(sha)),
  );
  const contributed = [];
  const alreadyOnBase = [];
  for (const commit of commits ?? []) {
    if (base.size > 0 && base.has(norm(commit?.sha))) alreadyOnBase.push(commit);
    else contributed.push(commit);
  }
  return { contributed, alreadyOnBase };
}

/**
 * Judge one commit range.
 *
 * @param {object} input
 * @param {string} input.branch          the head ref the range belongs to
 * @param {Array<{sha: string, author: {name: string, email: string},
 *                committer?: {name: string, email: string},
 *                message?: string, subject?: string}>} input.commits
 * @param {Iterable<string>} [input.baseShas]  every commit reachable from the
 *        base. These are dropped before judgement: they are already merged, and
 *        they are not this branch's to answer for (#949).
 * @returns {{ branch: string, agentBranch: boolean, unknownBranch: boolean,
 *             inspected: number, alreadyOnBase: number,
 *             offences: Array<object>, excused: Array<object> }}
 */
export function inspectRange({ branch, commits, baseShas }) {
  const unknownBranch = isUnknownRef(branch);
  // A branch this cannot name is a branch it cannot clear (#851, nc#535).
  const agentBranch = unknownBranch || isAgentBranch(branch);
  const offences = [];
  const excused = [];

  // What the branch CONTRIBUTED, which is the only thing it can be asked about.
  // A commit reachable from the base is already on the base — landing this pull
  // request does not land it, and no re-authoring on this branch could change
  // it (#949).
  const { contributed, alreadyOnBase } = partitionByBase(commits, baseShas);

  for (const commit of contributed) {
    if (!isFounderIdentity(commit.author)) continue;

    const byBranch = agentBranch;
    // Rule 2 needs BOTH halves. A trailer naming an agent is a disclosure, not
    // an accusation; it becomes one only when the founder's name is on a commit
    // the founder did not make. `Co-Authored-By: Claude` over `author: Johan,
    // committer: Johan` is the honest shape this repo's convention mandates —
    // refusing it was #851. A missing committer reads as "not the founder",
    // because unknown is not a pass.
    const founderCommitted = isFounderIdentity(commit.committer);
    const byTrailer =
      declaresAgent(commit.message ?? commit.subject ?? "") && !founderCommitted;
    if (!byBranch && !byTrailer) continue;

    const finding = {
      sha: commit.sha,
      subject: (commit.subject ?? String(commit.message ?? "").split("\n")[0] ?? "").trim(),
      claimed: `${commit.author?.name ?? "?"} <${commit.author?.email ?? "?"}>`,
      committer: commit.committer
        ? `${commit.committer.name} <${commit.committer.email}>`
        : null,
      // Still an offence — it is the founder's name on an agent branch — but
      // one with its own remedy, which the report gives separately (#958).
      updateBranch: isUpdateBranchMerge(commit),
      // Both reasons are recorded even when both fire, so a reader can see
      // whether the branch name or the commit's own trailers gave it away.
      reasons: [
        byBranch
          ? unknownBranch
            ? `the branch could not be identified (\`${branch}\`), so it is judged as an automated worker's`
            : `branch \`${branch}\` is an automated worker's`
          : null,
        byTrailer
          ? "the commit's own trailers declare an agent, and its committer is not the founder"
          : null,
      ].filter(Boolean),
    };

    const excuse = RECORDED_EXCEPTIONS.get(commit.sha);
    if (excuse) excused.push({ ...finding, excuse });
    else offences.push(finding);
  }

  return {
    branch,
    agentBranch,
    unknownBranch,
    inspected: contributed.length,
    alreadyOnBase: alreadyOnBase.length,
    offences,
    excused,
  };
}

/** The report. Loud by construction: every SHA, and the identity it claimed. */
export function formatReport(result) {
  const lines = [];
  lines.push(
    `commit identity: ${result.inspected} commit(s) on \`${result.branch}\`` +
      (result.unknownBranch
        ? " (unnameable branch — judged as an automated worker's)"
        : result.agentBranch
          ? " (an automated worker's branch)"
          : " (not an agent branch)")
  );
  // Said out loud, every run, so the narrowing is visible rather than implicit:
  // a reader can see how much of the payload was `main`'s and check the count
  // against the branch (#949).
  if (result.alreadyOnBase > 0) {
    lines.push(
      `  ${result.alreadyOnBase} commit(s) in the payload are already on the base and were ` +
        `not judged: they are merged, and not this branch's to answer for (#949).`
    );
  }

  for (const excused of result.excused) {
    lines.push(`  recorded exception ${excused.sha.slice(0, 8)}: ${excused.excuse}`);
  }

  if (result.offences.length === 0) {
    lines.push("  no commit claims a founder identity it is not entitled to.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push(
    `REFUSED: ${result.offences.length} commit(s) claim the founder's identity on work ` +
      `an agent produced.`
  );
  for (const offence of result.offences) {
    lines.push("");
    lines.push(`  ${offence.sha}`);
    lines.push(`    subject:   ${offence.subject}`);
    lines.push(`    author:    ${offence.claimed}   <- the borrowed identity`);
    if (offence.committer) lines.push(`    committer: ${offence.committer}`);
    lines.push(`    because:   ${offence.reasons.join("; ")}`);
  }

  // The Update-branch button (#958). Named before the generic remedy, because
  // the generic remedy — re-author — is the WRONG move for a merge commit a
  // button made, and following it would rewrite a merge rather than remove one.
  const buttonMerges = result.offences.filter((offence) => offence.updateBranch);
  if (buttonMerges.length > 0) {
    lines.push("");
    lines.push(
      [
        "  GITHUB'S \"UPDATE BRANCH\" BUTTON MADE " +
          `${buttonMerges.length === 1 ? "ONE OF THESE" : `${buttonMerges.length} OF THESE`}` +
          " (#958):",
        "",
        ...buttonMerges.map(
          (offence) => `    ${offence.sha.slice(0, 10)}  ${offence.subject}`
        ),
        "",
        "  `PUT /repos/:repo/pulls/:n/update-branch` — the green Update branch button on",
        "  the pull request page — authors its merge commit as THE TOKEN'S identity, which",
        "  for anything acting on Johan's behalf is the founder. Nobody typed this commit",
        "  and it carries no work of its own, so DO NOT re-author it. Drop the merge:",
        "",
        "    git fetch origin main && git rebase origin/main && git push --force-with-lease",
        "",
        "  Then do not press Update branch on an agent branch again — rebase instead. The",
        "  merge gate refuses this too, so there is no route round it (#958).",
      ].join("\n")
    );
  }

  lines.push("");
  lines.push(
    [
      "  This is not a formatting complaint. A commit authored with the founder's",
      "  email passes the CLA check and the merge gate, and reads in `git log` as",
      "  something Johan wrote. Landing it launders authorship into main, where the",
      "  office rules that turn on who wrote a thing can no longer tell.",
      "",
      "  IF AN AGENT WROTE THESE — the #622/#831 precedent: re-author, do not rename",
      "  the rule.",
      "",
      "    git rebase -i <base> --exec 'git commit --amend --no-edit \\",
      "      --author=\"rewyld-claude[bot] <299630839+rewyld-claude[bot]@users.noreply.github.com>\"'",
      "",
      "  Use the identity the worker actually is. Codex declares",
      "  `Codex <noreply@openai.com>`; both it and `rewyld-claude[bot]` are already on",
      "  the CLA allowlist, so a re-authored branch goes green rather than trading one",
      "  red check for another.",
    ].join("\n")
  );

  // The remedy above is the WRONG advice for a human, and saying it to one was
  // the sharp edge in #851: it tells Johan to attribute his own work to a bot,
  // a worse provenance lie than the one being prevented. So the human's route
  // is spelled out separately rather than left as a footnote to the bot's.
  lines.push("");
  lines.push(
    [
      "  IF JOHAN WROTE THESE, do not re-author them. Two honest routes:",
      "",
      "    - Commit under your own hand. `--author=` sets only the author; the",
      "      committer is whoever ran `git commit`. If the committer above is not",
      "      you, that is what rule 2 read. Amending from your own machine, with",
      "      no GIT_COMMITTER_* override in the environment, clears it:",
      "",
      "        git rebase -i <base> --exec 'git commit --amend --no-edit --reset-author'",
      "",
      "    - Or record the claim. Add the full SHA to RECORDED_EXCEPTIONS in",
      "      scripts/commit-identity-check.mjs with the reason. An exception is a",
      "      claim on the record with a name attached, which is the thing this",
      "      check is protecting in the first place.",
      "",
      "  Note what does NOT trigger rule 2: a commit you made yourself that credits",
      "  Claude in a `Co-Authored-By:` trailer. That is shared authorship, it is this",
      "  repo's own convention, and it passes (#851).",
    ].join("\n")
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reading a range
// ---------------------------------------------------------------------------

// ASCII unit and record separators. A commit body can contain any newline,
// pipe or tab someone can type; it cannot contain these, which is why the
// format string uses them rather than a punctuation character that looks safe
// right up until a commit message contains it.
const FIELD = "\x1f";
const RECORD = "\x1e";

/**
 * Read a commit range out of git. Used locally; CI uses the REST payload below.
 *
 * Merge commits are NOT excluded. `--no-merges` would have been tidier to read
 * and would have made the two ingest paths disagree: GitHub's `pulls/:n/commits`
 * lists merges, so a `--no-merges` local run would report green on a range CI
 * reports red on, and the difference would be invisible to whoever ran it. A
 * merge that claims the founder's identity is a claim like any other.
 */
export function commitsFromGit(range, { cwd, git = gitRunner } = {}) {
  const raw = git(
    ["log", `--format=%H${FIELD}%an${FIELD}%ae${FIELD}%cn${FIELD}%ce${FIELD}%B${RECORD}`, range],
    { cwd }
  );
  return raw
    .split(RECORD)
    .map((chunk) => chunk.replace(/^\n/, ""))
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const [sha, an, ae, cn, ce, message = ""] = chunk.split(FIELD);
      return {
        sha: String(sha).trim(),
        author: { name: an, email: ae },
        committer: { name: cn, email: ce },
        message,
      };
    });
}

/**
 * The only shape `--base-sha` may arrive in: a full, 40-character commit SHA.
 *
 * Deliberately the same shape `partitionByBase` requires of the set it builds.
 * A base named by anything else — a branch, a tag, `HEAD~3`, an option — is not
 * a value this check can subtract safely, and nothing legitimate passes one:
 * the workflow reads `github.event.pull_request.base.sha`, which GitHub always
 * populates in full.
 */
const FULL_SHA = /^[0-9a-f]{40}$/i;

/**
 * Refuse a `--base-sha` that is not a commit SHA, loudly (#976).
 *
 * Throws rather than returning a flag, because the caller in `main()` already
 * has the right catch around it: a base it cannot list means the subtraction is
 * abandoned, the reason is printed, and the WHOLE range is judged. That is the
 * direction that cannot hide a commit, and a bad `--base-sha` earns exactly the
 * same treatment as an unreadable one.
 *
 * @param {unknown} value
 * @returns {string} the same value, once it is known to be a SHA
 */
export function assertBaseSha(value) {
  const sha = String(value ?? "").trim();
  if (!FULL_SHA.test(sha)) {
    throw new Error(
      `--base-sha is not a commit SHA: ${JSON.stringify(String(value ?? ""))}. ` +
        `It names the set this check SUBTRACTS, so a ref that is not a base — a ` +
        `branch name, the head itself, or an option like \`--all\` — would narrow the ` +
        `guard rather than fail it.`
    );
  }
  return sha;
}

/**
 * Every commit reachable from a ref, as full SHAs (#949).
 *
 * This is the set the REST path subtracts. It runs against the BASE checkout —
 * `main`'s own history, which the workflow already has — and never against the
 * head branch, so it adds no code from the branch under judgement to what CI
 * executes. It is one `rev-list` rather than a call per commit: the whole of
 * `main` is ~600 commits here.
 *
 * The ref is peeled with `^{commit}` rather than handed to `rev-list` bare
 * (#976). `execFileSync` already rules out a shell, but it does NOT stop a
 * value that merely LOOKS like an option from being read as one: `rev-list
 * --all` walks every ref and would subtract an entire payload, silently and
 * green. `--all^{commit}` is not a rev, so git refuses it and the caller falls
 * back to judging everything. `assertBaseSha` is the first line of defence for
 * the value CI passes; this is the one that holds for any future caller, and it
 * costs a suffix. `main^{commit}` and `<sha>^{commit}` resolve exactly as the
 * bare forms do, so no legitimate ref changes meaning.
 */
export function shasReachableFrom(ref, { cwd, git = gitRunner } = {}) {
  return git(["rev-list", `${String(ref ?? "").trim()}^{commit}`], { cwd })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function gitRunner(args, { cwd } = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Read a range out of GitHub's REST `pulls/:number/commits` payload.
 *
 * `commit.author` there is the git author — the field being laundered — and NOT
 * the top-level `author`, which is the GitHub account GitHub guessed at. The
 * two disagree exactly in the case this check exists for, so reading the wrong
 * one would report green on the bug.
 */
export function commitsFromRestPayload(payload) {
  // `.flat()` because `gh api --paginate` merges pages into one array on most
  // versions and emits an array of page-arrays on others. Flattening once
  // accepts both rather than reporting "0 commits" — a green — on the second.
  const rows = Array.isArray(payload) ? payload.flat() : [];
  return rows.map((row) => ({
    sha: row.sha,
    author: {
      name: row.commit?.author?.name ?? "",
      email: row.commit?.author?.email ?? "",
    },
    committer: {
      name: row.commit?.committer?.name ?? "",
      email: row.commit?.committer?.email ?? "",
    },
    message: row.commit?.message ?? "",
  }));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgv(argv) {
  const options = { branch: null, range: null, commitsJson: null, baseSha: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--branch") options.branch = argv[++i] ?? null;
    else if (arg === "--range") options.range = argv[++i] ?? null;
    else if (arg === "--commits-json") options.commitsJson = argv[++i] ?? null;
    else if (arg === "--base-sha") options.baseSha = argv[++i] ?? null;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

export function main(argv = process.argv.slice(2), { cwd, git = gitRunner } = {}) {
  const options = parseArgv(argv);
  const branch =
    options.branch ?? git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd }).trim();

  let commits;
  if (options.commitsJson) {
    const payload = JSON.parse(readFileSync(options.commitsJson, "utf8"));
    commits = commitsFromRestPayload(payload);
    // An empty payload where a pull request certainly has commits means the API
    // read failed and produced `[]`. Reporting green on that is exactly the
    // silence this check was written to end (the nc#535 rule: unknown is not a
    // pass), so it is a refusal with its own message rather than a clean exit.
    if (commits.length === 0) {
      console.error(
        `commit identity: ${options.commitsJson} carried no commits.\n` +
          `  A pull request always has at least one, so this is a failed read, not a\n` +
          `  clean range — and a check that passes when it could not see the commits is\n` +
          `  the silent allow it exists to prevent. Re-run the workflow.`
      );
      return 1;
    }
  } else {
    commits = commitsFromGit(options.range ?? "origin/main..HEAD", { cwd, git });
  }

  // Everything already on the base is dropped before judgement (#949). A
  // failure to read the base is NOT fatal and is NOT silent: the whole range is
  // judged instead — over-inclusive, which is the direction that cannot hide a
  // commit — and the reason is printed so a 244-commit report is legible as a
  // broken subtraction rather than as 244 borrowed identities.
  let baseShas;
  if (options.baseSha) {
    try {
      // Checked before it is used (#976): a base that is not a SHA is treated
      // as a base that cannot be read, which is what the catch below already
      // does — abandon the subtraction, say so, judge everything.
      baseShas = shasReachableFrom(assertBaseSha(options.baseSha), { cwd, git });
    } catch (error) {
      console.error(
        `commit identity: could not list the commits reachable from base ` +
          `${options.baseSha} (${String(error?.message ?? error).split("\n")[0]}).\n` +
          `  Judging the WHOLE range instead. Nothing is hidden by this, but the report\n` +
          `  below may name commits that are already on the base and are nobody on this\n` +
          `  branch's to answer for. Check the base checkout fetched its history\n` +
          `  (\`fetch-depth: 0\`) — see #949.`
      );
    }
  }

  // A base that subtracts EVERYTHING is not a base (#976).
  //
  // `--base-sha <the branch's own head>` is 40 hex and a real commit, so it
  // passes every check above, and every commit in the payload is reachable from
  // it: the guard judges nothing and exits 0. That is the same silence as the
  // empty-payload read handled earlier, and it gets the same answer — a pull
  // request always contributes at least one commit, so nothing left to judge is
  // a failed subtraction rather than a clean range (the nc#535 rule: unknown is
  // not a pass). Discard the subtraction and judge the lot. Over-inclusive and
  // loud is recoverable; silent and green is the failure this file exists for.
  if (
    baseShas !== undefined &&
    commits.length > 0 &&
    partitionByBase(commits, baseShas).contributed.length === 0
  ) {
    console.error(
      `commit identity: base ${options.baseSha} accounts for the WHOLE range — all ` +
        `${commits.length} commit(s) in the payload are reachable from it, leaving nothing\n` +
        `  to judge. A pull request contributes at least one commit, so that is a base\n` +
        `  pointing at the wrong place (the head itself, or a ref that reaches it), not a\n` +
        `  clean range. Ignoring it and judging the WHOLE range instead — see #976.`
    );
    baseShas = undefined;
  }

  const result = inspectRange({ branch, commits, baseShas });
  const report = formatReport(result);
  if (result.offences.length > 0) {
    console.error(report);
    return 1;
  }
  console.log(report);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main());
}
