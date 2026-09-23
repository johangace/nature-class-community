#!/usr/bin/env node
/**
 * merge-pr.mjs — the merge gate this repository cannot get from GitHub.
 *
 * Branch protection is unavailable here (private repository, personal
 * account plan), so nothing server-side stops a merge whose checks never
 * ran. Issue #535 documented the failure this leaves open: a conflicted
 * PR gets NO `pull_request` event at all — no run, no red X, an empty
 * checks tab — because GitHub cannot build the synthetic merge commit.
 * "Nothing is red" and "the build passed" are different claims.
 *
 * So the gate lives in the merge command instead. Merge through this
 * script, never through a bare `gh pr merge`:
 *
 *   node scripts/merge-pr.mjs <pr-number> [--wait] [--dry-run]
 *       [--admin-override "<reason>"] [--johan-cleared "#<ticket> <where>"]
 *
 * --dry-run judges the gates below exactly as a real run does and merges
 * nothing. The verdict short-circuits on the FIRST refusal, like every other
 * run, so a dry run of a pull request behind main hands back that refusal and
 * says nothing about its build — the facts were read, the later gates were
 * not judged. On the path that would merge it prints the squash title it
 * would write and stops there.
 * An argument this script does not recognise refuses the run (#1242).
 *
 * It refuses unless ALL of these hold on the PR's CURRENT head SHA:
 *   1. the PR targets main and is open;
 *   2. every ticket the merge will CLOSE is one the body DECLARES it
 *      closes — no closing keyword left lying in prose (#983), and the
 *      squash commit message, which this gate now COMPOSES rather than
 *      leaves to GitHub, cannot add one (#995);
 *   3. no ticket the PR closes carries a CONTENT GATE — `johan-gated`
 *      or `johan-decision` (#823);
 *   4. GitHub reports it mergeable (no conflict, merge ref exists);
 *   5. the head branch is 0 commits behind main (strict up-to-date —
 *      closes the N-minute collision window between parallel sessions);
 *   6. the `build` check-run CONCLUDED SUCCESS on that exact SHA;
 *   7. the `identity` check-run (commit-identity.yml) CONCLUDED SUCCESS
 *      on that exact SHA;
 *   8. the `mergeable` check-run (pr-merge-check.yml) is success, or,
 *      for PRs predating that workflow, the API mergeable field is
 *      accepted in its place with a warning.
 *
 * --admin-override requires a written reason and prints it loudly; it
 * exists for a wedged emergency, not for impatience.
 *
 * WHY `identity` IS IN THAT LIST (#958)
 *
 * GitHub's "Update branch" button — `PUT /repos/:repo/pulls/:n/update-
 * branch` — authors its merge commit as the TOKEN'S identity, which for
 * anything acting on Johan's behalf is the founder. Press it on an agent
 * branch and `commit-identity.yml` refuses the branch, correctly: the
 * founder's name is now on a commit he did not write, on a branch a
 * worker opened. It happened on #939 and #944 on 2026-09-03.
 *
 * This gate read `build` and `mergeable` and nothing else, so CI refused
 * that state and the gate did not. The thing standing between an
 * update-branch merge commit and `main` was a person reading the checks
 * tab — which is exactly the reliance #893 was filed to remove, and had
 * the wait-merge on #939 not been interrupted, a Johan-authored merge
 * commit would have landed on `main` on a green gate.
 *
 * It is deliberately shaped like `build` rather than like `mergeable`:
 * absent is not success and there is NO fallback. `mergeable` has one
 * because the API's own `mergeable` field answers the same question; no
 * API field answers "whose name is on these commits", so an absent
 * `identity` run leaves the question unanswered, and an unanswered
 * provenance question is the #535 failure mode. A pull request old enough
 * to predate `commit-identity.yml` gets its run by being pushed to, which
 * is what a rebase onto a current `main` does anyway.
 *
 * THE CLOSING SET IS READ FROM THE BODY, AND ONLY DECLARATIONS COUNT
 * (condition 2, #983)
 *
 * A merge here closes tickets, and GitHub decides which ones. Its rule
 * is one line long and has no notion of what a sentence MEANS: a closing
 * keyword followed by `#N`, ANYWHERE in the pull request body, links the
 * issue and closes it on merge. Not only at the top, not only on its own
 * line, not only in the affirmative.
 *
 * On 2026-09-04, PR #981's #977 half was split out of the branch after
 * review. `Closes #977` was removed from its body; what stayed was the
 * paragraph explaining the removal — "An earlier revision of this branch
 * also tried to fix #977 by anchoring the verification predicate. That
 * was wrong and I have removed it… #977 stays open." GitHub read `fix
 * #977`, and closed #977 two seconds after the merge. Nothing about #977
 * was fixed; a person reopened it by hand.
 *
 * The same thing had already happened on PR #930, whose body says, in
 * parentheses, "does not close #922". GitHub read `close #922` and
 * closed #922 one second after that merge — and #922 was still closed
 * five days later, with PR #927 open against it.
 *
 * So this is not a stale cache to be refreshed: at the moment of both
 * merges, GitHub and this script were reading the SAME current body and
 * agreeing about it. The body was the problem. A gate that only re-reads
 * the body cannot help, because the body genuinely says `fix #977`.
 *
 * What separates `Closes #978` from `tried to fix #977` is not the words
 * — it is the position. A closing directive is a DECLARATION when it
 * OPENS a clause: at the start of a line, after a list marker or a
 * blockquote, or after the punctuation that closed the clause before it
 * (`No merge performed. Closes #703.`, `Closes #531, closes #524.`).
 * Mid-clause, a keyword is being used as an ordinary verb about a ticket
 * — "tried to fix #977", "does not close #922", "and closed #403" — and
 * the author is narrating, not claiming.
 *
 * GitHub cannot draw that line. This script can, and where the two
 * disagree it REFUSES rather than merges, naming the sentence. That is
 * the only structural answer available: the close is GitHub's to perform
 * from text we do not control at merge time, so the sole way to make an
 * undeclared close impossible is to decline to merge until the text no
 * longer says it. The remedy is one edit — declare it (`Closes #977.`)
 * or rephrase it (`addressed #977`, or put the keyword in backticks) —
 * and the refusal quotes the exact words so it takes seconds.
 *
 * The TITLE still authorises nothing. It is this repo's convention for
 * saying which ticket a PR is ABOUT, and GitHub never closes from a title.
 * PR #930's title said `(#922)` while its body said it does not close
 * #922; treating the title as consent would have waved through the very
 * merge that broke #922.
 *
 * Blast radius, measured against the 435 merged pull requests this
 * repository had on 2026-09-05: ten would be refused, every one of them for
 * a keyword sitting in prose, each fixable in one line — and four of the
 * ten (#981, #930, #122, #247) are confirmed wrong closures, each one a
 * ticket GitHub shut within two seconds of a merge whose body said in as
 * many words that it did not. That is the #435 cry-wolf test met: 2.3%,
 * all true positives. (The figure the #989 body reported, seven of 288,
 * was measured against a partial list of this repository's merges.)
 *
 * THE SECOND CHANNEL: THE SQUASH COMMIT MESSAGE (#995)
 *
 * The body is not the only text GitHub closes from. A commit message
 * landing on the default branch closes issues by exactly the same rule,
 * and until #995 this gate did not read one. The header used to justify
 * that as "deliberately BODY-ONLY" on the grounds that GitHub never closes
 * from a TITLE — true of titles, and not true of commit messages.
 *
 * It cost immediately. PR #989 — the pull request that installed the body
 * gate above — merged at 2026-09-05T22:05:44Z with a clean gate report
 * naming only #983. One second later GitHub closed #922, attributing it to
 * that squash commit, because the squash message is composed from the
 * BRANCH's commit messages and #989's branch commit narrates the #930
 * incident in prose — "GitHub read `clos·e #922` and clos·ed #922 one
 * second after that merge". The merge that shipped the fix for #983
 * committed #983's own bug, against the ticket #983 was written about,
 * ninety minutes after a person had reopened it by hand.
 *
 * THAT CHANNEL IS WORSE THAN THE BODY, WHICH IS WHY THE ANSWER IS NOT A
 * SECOND REFUSAL. A body is editable up to the moment of the merge, so the
 * body gate's remedy is a one-line edit and a re-run. A commit message on
 * a pushed branch is not: fixing one means rewriting history and re-running
 * every check, on a repository where being one commit behind main is
 * itself a refusal. A gate whose only remedy is a rebase is a gate people
 * learn to route around, and #435 measured what that costs.
 *
 * So the cause is removed instead. `PUT /pulls/:n/merge` accepts
 * `commit_title` and `commit_message`, and this script now SUPPLIES BOTH.
 * The squash message stops being text GitHub composes from commits nobody
 * gated and becomes text this gate composed and read. `composeSquashMessage`
 * reproduces what the repository's own merge settings produce today
 * (`squash_merge_commit_title: COMMIT_OR_PR_TITLE`,
 * `squash_merge_commit_message: COMMIT_MESSAGES`), so `main`'s history
 * keeps the shape it has always had — including the `Co-authored-by`
 * trailers the branch commits carry — and then `separateUndeclaredClosings`
 * breaks any closing keyword in it that names a ticket THE BODY DOES NOT
 * DECLARE, using this repository's own `clos·es` separator (#942).
 *
 * The rule is one line: the tickets a merge closes are the tickets the
 * BODY declares, and nothing else. Whatever a commit message says about a
 * ticket, it says as narration. That is right by construction rather than
 * by luck — the body is the reviewed, editable, authoritative statement of
 * what a PR claims, it is what the gate reports, and it is what GitHub
 * already closes from. So there is no new refusal here at all, no branch
 * rewrite, and no cry-wolf: every separation is printed as a warning, and
 * the squash message itself carries a trailer saying which keywords were
 * separated and why.
 *
 * Position analysis is deliberately NOT used on the commit message. A
 * commit message is hard-wrapped prose, so a line start there is an
 * artifact of the wrap rather than the opening of a clause — in #989's own
 * branch commit the mid-sentence `clos·e #922` had wrapped onto a fresh
 * line and would have read as a DECLARATION. The body is where a claim is
 * made; the message only inherits it.
 *
 * Measured against the 456 squash commits on `main`: eight carried a
 * closing reference their pull request's body never declared — eighteen
 * references over ten distinct tickets, of which #922 is a confirmed live
 * casualty. Under this change all eighteen are separated and not one of
 * the eight merges is refused.
 *
 * An unreadable or truncated commit list REFUSES, like an unreadable
 * label. We cannot compose a message from commits we could not read, and
 * silently landing an empty commit body on `main` would throw away the
 * branch's own account of itself (#436's lesson, one level up).
 *
 * WHICH SPELLINGS OF A CLOSING REFERENCE COUNT (#991)
 *
 * Three, because GitHub honours three, and each was blind here:
 *
 *   · `closes #403` — the bare form.
 *   · `closes johangace/nature-class#403` — the QUALIFIED form, honoured
 *     and used here: PR #867's body carries only `Clos·es
 *     johangace/nature-class#60` and #60 closed two seconds after that
 *     merge. Only THIS repository's own qualified refs count; a ref to
 *     another repository closes nothing here and is not a declaration.
 *     PR #868 was the cost of the blindness — its line 1 declares
 *     `Clos·es johangace/nature-class#403` while its prose narrates the
 *     earlier attempt, so the gate saw the narration, missed the
 *     declaration, and refused a body that had done nothing wrong.
 *   · `fix·ed: #121` — the COLON form, and it is honoured too. PR #122's
 *     body reads "Flagged but deliberately **not** fix·ed: #121" and #121
 *     closed two seconds after that merge; PR #247's reads "**Deliberately
 *     not fix·ed: #245.**" and #245 closed one second after its merge,
 *     attributed to commit `5c1221d04e`, whose message says the same thing
 *     in the same words. Two more disclaimer casualties of #983's exact
 *     shape, invisible until this pattern could see a colon — and #245 is
 *     a second instance of the commit-message channel above, closed by a
 *     message rather than by a body.
 *
 * A full issue URL (`fixes https://github.com/johangace/nature-class/issues/8`)
 * is matched too, for this repository only. No body here uses it, so it is
 * matched on GitHub's documented behaviour rather than on local evidence —
 * over-inclusiveness is the cheap direction (#823) and it costs nothing
 * measurable.
 *
 * A COMMA opens a declaration only after another closing directive. That
 * is what makes `Clos·es #531, clos·es #524.` the two-declaration body
 * its author plainly meant, and it is checked by looking at the clause the
 * comma closed rather than by trusting the comma itself: in `unclear
 * whether this fix·es #922, clos·es #923` the clause before the comma is
 * not a closing directive, so #923 is prose and refuses like any other.
 *
 * WHAT THIS STILL DOES NOT DO, ON PURPOSE
 *
 *   · A four-space indented block in a BODY is still read as code and its
 *     keywords still do not count. Whether GitHub honours a closing
 *     keyword there is not settled by this repository's history, and the
 *     stripping is deliberate and #953-hardened; narrowing it on a guess
 *     would refuse bodies for a shape GitHub may well ignore. The commit
 *     message channel is not affected — nothing is stripped there.
 *   · The body refusal has NO override, and it is the only condition here
 *     that has none. That is not an oversight. Every other refusal names a
 *     fact the operator cannot change in band — a red build, a stale head,
 *     a question only Johan can answer — and an override exists so a
 *     wedged emergency is not unmergeable. This one names TEXT, in a
 *     document the person running the merge can edit in ten seconds, and
 *     an override for it would be an override of the author's own words in
 *     favour of closing a ticket nobody claimed. There is no wedge to
 *     relieve.
 *   · Nothing here governs a commit pushed straight to `main`, which
 *     closes issues from its message with no pull request and no gate in
 *     the path at all. 169 of `main`'s 625 commits arrived that way.
 *
 * It runs BEFORE the content gate on purpose. Condition 3 reasons about
 * "the tickets this PR closes"; if that set contains a ticket nobody
 * meant to name, every judgement built on it is about the wrong PR.
 *
 * THE CONTENT GATE (condition 3, #823)
 *
 * Every other condition in that list asks one question — did the machine
 * agree this code is safe to land? — and for a whole class of pull
 * request that is the wrong question. #820 rewrote the landing's central
 * claim against #703, a ticket carrying `johan-gated`, `johan-decision`
 * and `track:content` and sitting on the office decision queue. It was
 * green, and that is not a hypothetical: replay #820's real head, real
 * check-runs and real labels through this function with the content gate
 * removed and it comes back `merge`.
 *
 * It landed on 2026-09-01 with Johan himself pressing the button, which
 * is the right person. That is exactly the problem. Nothing in this
 * script could tell that merge apart from the identical merge run by a
 * night shift at three in the morning, on the landing of the repository
 * that flips public, on the strength of a build that has no opinion
 * whatsoever about what the landing says. A gate that cannot distinguish
 * the founder answering his own question from a worker answering it for
 * him is not gating that question at all — and 21 of the last 350 merges
 * here closed a ticket carrying one of these two labels.
 *
 * A green build cannot clear a content gate. It is not the kind of thing
 * a build can know. #679's lesson was that a gate nothing routes work
 * through is indistinguishable from no gate; this is the other half — a
 * gate that routes everything through one test is indistinguishable from
 * no gate for the class of decision that test cannot make. So the script
 * reads the labels of the tickets a PR closes and refuses by name.
 *
 * It is evaluated EARLY — before mergeability, before the build, second
 * only to the closing-set check that decides what "the tickets this PR
 * closes" even means (#983) — and it is never waitable. Time cannot dissolve a content gate, and a --wait
 * that sat fifteen minutes on a build for a PR that can never merge would
 * spend the operator's afternoon reaching a refusal that was already true
 * when they typed the command.
 *
 * WHICH TICKETS COUNT: every `#N` in the PR TITLE (this repository's
 * convention is to name the ticket there, `... (#703)`) plus GitHub's own
 * closing keywords in the body — `closes #N`, `fixes #N`, `resolves #N`.
 * Deliberately NOT every `#N` in the body: these bodies cite half a dozen
 * prior tickets for their reasoning, and refusing on a citation is the
 * gate that cries wolf, whose cost #435 measured. Deliberately
 * over-inclusive on the title, because the two errors are not symmetric —
 * a wrong refusal costs one flag and thirty seconds, a wrong pass answers
 * a founder's question for him in public.
 *
 * A keyword the body is QUOTING is not a claim (#942). Code — fenced
 * blocks, indented blocks, inline backtick spans — is stripped from the
 * body before the keywords are read, because a PR that pastes a sweep's
 * output, a gate refusal or a shift log as evidence otherwise inherits
 * every closing reference in the quoted text; PR #941 inherited five.
 * See `stripCode`. The title is not stripped and does not want to be.
 *
 * A ticket whose labels CANNOT BE READ refuses too. Absence of a label is
 * not evidence of no gate, for the same reason a missing check-run is not
 * a green one (#535). A 404 is different: that is an answer — the number
 * is not a ticket here — and so is a reference that resolves to a pull
 * request.
 *
 * --johan-cleared "<written reason naming the ticket>" is the only way
 * past it, and it must NAME every gated ticket it clears: the reason is
 * scanned for `#N`, and a gated ticket the reason does not name is still
 * refused. So an override cannot become a habit copied between shells —
 * it says, in the shell history and in the merge report, which question
 * Johan answered and where he answered it. It waives the label gate and
 * nothing else; --admin-override, symmetrically, waives the up-to-date
 * rule and never this one.
 *
 * --wait (#594) changes NO POLICY. Every condition above is still
 * evaluated and still refuses. What it changes is who is holding the
 * stopwatch. #594 recorded #591 — a one-line fix to this very script —
 * losing three merge races in a row: rebase, push, wait ~2m35s for
 * `build`, and by the time it is green another session has landed on
 * main and the head is behind again. The killer is not the build time,
 * it is the dead air between "build went green" and "a human noticed
 * and re-ran the gate". With --wait the script sits on the poll itself
 * and merges within one poll interval of green, so the window main has
 * to move in shrinks from minutes to seconds.
 *
 * What --wait will and will not sit on, and why:
 *
 *   waitable — time alone can fix it
 *     · `build` queued or in_progress: it is going to conclude.
 *     · `build` not present on the head yet: a just-pushed SHA has no
 *       check-run for a few seconds. Refusing there would defeat the
 *       whole point, since "push then merge" is the case #594 is about.
 *     · mergeable still null: GitHub computes it lazily.
 *
 *   NOT waitable — refuse at once, no matter how much budget is left
 *     · `build` concluded anything but success. A red build does not
 *       turn green by being stared at, and spinning on one is how a
 *       wait loop becomes a way to sleep through a failure.
 *     · behind main. This is the deliberate one. Waiting cannot fix it
 *       either — only a rebase and a push can, and this script does
 *       neither — so we fail fast and hand the operator back their
 *       2m35s instead of spending it to reach the same refusal. That
 *       holds for going stale DURING a wait too: main moving mid-wait
 *       is exactly the collision #535 is about, and the answer to it is
 *       a rebase, not a merge.
 *     · closed, retargeted, drafted, or conflicted. All human actions;
 *       none of them undo themselves.
 *
 * The correctness heart of --wait: every gate is re-evaluated from
 * freshly fetched facts on every poll, and the merge fires off the
 * evaluation that just ran, never off one that was true when the wait
 * started. Time passing is the whole premise, so nothing observed
 * before a sleep is evidence after it. The head SHA is re-read too — if
 * someone pushes mid-wait, the wait restarts against the new head
 * rather than merging on the strength of the old head's green build.
 *
 * EVERY GITHUB CALL HERE IS REST, INCLUDING THE MERGE (#859)
 *
 * The gate reads facts over REST, and since nc#1205 it speaks REST
 * ITSELF — `scripts/github-api.mjs`, spawned as a child — rather than
 * shelling out to `gh`. The containers these merges actually run in
 * carry a token and no `gh`, so the old transport died on
 * `spawnSync gh ENOENT` before a single condition was evaluated, and
 * the merge went through only because somebody wrote a throwaway `gh`
 * shim in a scratchpad. That is the same "eight merges depending on a
 * shim" shape #859 is about, one layer down.
 *
 * The gate's final action used to be
 * `gh pr merge`, which `gh` implements over GitHub's GraphQL API. The
 * night builder's cloud sessions serve REST and refuse GraphQL with
 * HTTP 403, so in the environment where merges actually happen every
 * condition was evaluated correctly, the script reported all gates
 * green, and then the merge itself died on transport. A gate that
 * degrades that way looks like a passing gate right up to the moment it
 * does nothing, and it left eight merges in one night depending on a
 * throwaway `gh` shim rather than on this script. The merge now goes
 * through `PUT /repos/:repo/pulls/:n/merge` like everything else, and
 * the JSON it answers with carries the same facts `gh pr merge` printed.
 *
 * That endpoint also takes `sha`, and we pass THE EXACT HEAD THE GATE
 * EVALUATED. GitHub then refuses the merge itself (409) if the head
 * moved between the last fact-read and the merge call. This is strictly
 * stronger than `gh pr merge` ever was: the sub-second collision window
 * #594 could only shrink is now closed by the server, because the merge
 * names the commit it was authorised for instead of merging whatever
 * "the head" happens to mean by the time the call lands.
 */

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { assertHistoryComplete, formatGate, gateBranch } from "./branch-salvage-sweep.mjs";
import { API_HELPER, ghApiSync } from "./github-api.mjs";

export const REPO = "johangace/nature-class";

export const BUILD_CHECK = "build";
export const MERGEABLE_CHECK = "mergeable";

/**
 * The check-run `.github/workflows/commit-identity.yml` publishes (#958).
 *
 * The name is the JOB id — `identity` — not the workflow's display name
 * ("Commit identity"), because that job declares no `name:`. Getting this
 * string wrong is a silent widening rather than a crash: the gate would find no
 * run of that name on any SHA and either stall every merge or, worse if the
 * absence branch were softened, wave every merge through. So it is pinned to
 * the workflow by a test, not by memory.
 */
export const IDENTITY_CHECK = "identity";

/**
 * The labels that say a ticket's answer is Johan's to give (#823). A pull
 * request that closes one of these is refused however green it is.
 *
 * Two labels rather than one because they mark two different reservations and
 * both were on #703: `johan-decision` is a call waiting on the founder,
 * `johan-gated` is work that may not land until he has made it.
 */
export const CONTENT_GATE_LABELS = ["johan-gated", "johan-decision"];

/** GitHub's own closing keywords, which is what makes a reference a claim. */
const CLOSING_KEYWORD = String.raw`(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)`;

/** The keyword alone, at the head of a match — the part the separator splits (#995). */
const CLOSING_KEYWORD_HEAD = new RegExp(String.raw`^${CLOSING_KEYWORD}`, "i");

/**
 * The three ways GitHub lets a closing keyword name its ticket (#991): a bare
 * `#403`, a qualified `owner/repo#403`, or the issue's own URL. The owner and
 * repository are captured rather than assumed, because a qualified ref to
 * SOMEONE ELSE'S repository closes nothing here — see `closingMatches`.
 */
const CLOSING_TARGET = String.raw`(?:https?:\/\/github\.com\/(?<urlOwner>[\w.-]+)\/(?<urlRepo>[\w.-]+)\/issues\/(?<urlNumber>\d+)|(?:(?<owner>[\w.-]+)\/(?<repo>[\w.-]+))?#(?<number>\d+))`;

/**
 * A closing reference in any spelling GitHub honours.
 *
 * `\s*:?\s+` rather than `\s+` because the COLON form closes too, which this
 * repository's own history settles twice over: PR #122 said "deliberately
 * **not** fix·ed: #121" and #121 closed two seconds after that merge; PR #247
 * said "**Deliberately not fix·ed: #245.**" and #245 closed one second after
 * its own. Both are disclaimer casualties of exactly #983's shape, and both
 * were invisible to a pattern that required whitespace.
 */
const CLOSING_REFERENCE = new RegExp(
  String.raw`\b${CLOSING_KEYWORD}\s*:?\s+${CLOSING_TARGET}\b`,
  "gi",
);

/** The same reference, anchored, for asking whether a clause ENDS in one. */
const CLOSING_REFERENCE_TAIL = new RegExp(
  String.raw`${CLOSING_KEYWORD}\s*:?\s+${CLOSING_TARGET}[ \t>*_~\`)\]]*$`,
  "i",
);

/** Every `#N` in a string, in order, deduplicated. */
export function ticketRefs(text) {
  const refs = [...String(text ?? "").matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  return [...new Set(refs)];
}

/** An opening (or closing) code fence: up to three spaces, then ``` or ~~~. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** A list bullet or blockquote at the left margin — the reason for the list guard below. */
const LIST_OR_QUOTE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|^ {0,3}>/;

/** A list bullet or blockquote marker, read at whatever column the scan has reached. */
const MARKER = /^(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)|^>/;

/**
 * A line that OPENS a block of its own, and so cannot be the LAZY CONTINUATION
 * of the paragraph above it: heading, blockquote, list item, fence, thematic
 * break, HTML. (CommonMark lets only paragraph text continue lazily.)
 */
const BLOCK_START =
  /^ {0,3}(?:#{1,6}(?:[ \t]|$)|>|(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|`{3,}|~{3,}|(?:\*[ \t]*){3,}$|(?:-[ \t]*){3,}$|(?:_[ \t]*){3,}$|<)/;

/** A kept line that leaves NO open paragraph behind it for a lazy line to continue. */
const NOT_PARAGRAPH =
  /^ {0,3}(?:#{1,6}(?:[ \t]|$)|(?:\*[ \t]*){3,}$|(?:-[ \t]*){3,}$|(?:_[ \t]*){3,}$|<)/;

/** A line's leading indent in COLUMNS; a tab advances to the next multiple of four. */
function indentWidth(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += 4 - (width % 4);
    else break;
  }
  return width;
}

/**
 * The CONTENT INDENTS the container markers at the head of a line open, read
 * left to right from `base` (the content indent already in force): `- x` opens
 * one at 2, `- > x` opens two, at 2 and 4. Empty when the line opens none.
 *
 * A marker four or more columns past the content indent it sits in is code
 * rather than a marker, which is where the scan stops. CommonMark puts an
 * item's content after one to four spaces of the marker; more than four (or
 * nothing left on the line) starts the content one column past the marker and
 * leaves the rest of the run to it.
 */
function containerStarts(line, base) {
  const opens = [];
  let i = 0;
  let col = 0;
  let origin = base;

  while (opens.length < 8) {
    while (i < line.length && (line[i] === " " || line[i] === "\t")) {
      col += line[i] === "\t" ? 4 - (col % 4) : 1;
      i += 1;
    }
    if (col - origin > 3) break;

    const marker = line.slice(i).match(MARKER);
    if (!marker) break;
    col += marker[0].length;
    i += marker[0].length;

    let after = col;
    let j = i;
    while (j < line.length && (line[j] === " " || line[j] === "\t")) {
      after += line[j] === "\t" ? 4 - (after % 4) : 1;
      j += 1;
    }
    const spaces = after - col;
    const nothingFollows = j >= line.length;
    const content = nothingFollows || spaces > 4 ? col + 1 : col + Math.max(spaces, 1);

    opens.push(content);
    if (nothingFollows || spaces > 4) break;
    origin = content;
    i = j;
    col = after;
  }

  return opens;
}

/**
 * One pass of the line scanner, answering "is this line code?" per line.
 *
 * With `trackContainers` false this is the original line-based scan, which
 * knows nothing of what a list item or a blockquote contains. With it true the
 * same machine also carries the innermost container's CONTENT INDENT, and
 * judges indented blocks and fence closers relative to that — which is the only
 * way to tell the two shapes in #953 apart from code. See `stripCode` for why
 * the two passes are run and how their answers are combined.
 */
function scanCode(lines, trackContainers) {
  const isCode = [];
  /** @type {{ char: string, length: number, containerIndent: number } | null} */
  let fence = null;
  let afterBlank = true;
  let inIndentedCode = false;
  let inListOrQuote = false;
  /** Content indents of the open containers, outermost first. */
  const containers = [];
  let paragraphOpen = false;
  const containerIndent = () => (containers.length ? containers[containers.length - 1] : 0);

  for (const line of lines) {
    const blank = line.trim() === "";
    const indent = indentWidth(line);

    if (fence) {
      // A CONTAINER ends its fence. Nothing continues lazily inside a code
      // block, so the first non-blank line indented less than the fence's own
      // container has left the item, and the block with it. The line is then
      // re-read below as the prose it is, rather than swallowed to EOF.
      const leftContainer = !blank && indent < fence.containerIndent;
      if (!leftContainer) {
        const close = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
        if (
          close &&
          close[1][0] === fence.char &&
          close[1].length >= fence.length &&
          indent <= fence.containerIndent + 3
        ) {
          fence = null;
        }
        isCode.push(true);
        paragraphOpen = false;
        continue;
      }
      fence = null;
    }

    if (blank) {
      afterBlank = true;
      paragraphOpen = false;
      isCode.push(false);
      continue;
    }

    // Containers this line has fallen out of close here — UNLESS the line is a
    // lazy continuation of the paragraph above, which stays inside the item it
    // continues even though it sits at the margin.
    if (trackContainers && indent < containerIndent()) {
      const lazy = paragraphOpen && !BLOCK_START.test(line);
      if (!lazy) while (containers.length && indent < containerIndent()) containers.pop();
    }

    const opening = line.match(FENCE);
    // An opening ``` fence's info string may not itself contain a backtick,
    // which is what keeps `a``b` in prose from opening a block.
    if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
      fence = {
        char: opening[1][0],
        length: opening[1].length,
        containerIndent: containerIndent(),
      };
      isCode.push(true);
      paragraphOpen = false;
      continue;
    }

    const indented = /^(?: {4}|\t)/.test(line);
    if (
      indented &&
      !inListOrQuote &&
      indent >= containerIndent() + 4 &&
      (afterBlank || inIndentedCode)
    ) {
      inIndentedCode = true;
      afterBlank = false;
      paragraphOpen = false;
      isCode.push(true);
      continue;
    }
    inIndentedCode = false;

    if (!indented) {
      if (LIST_OR_QUOTE.test(line)) inListOrQuote = true;
      else if (!/^[ \t]/.test(line)) inListOrQuote = false;
    }

    if (trackContainers) {
      for (const content of containerStarts(line, containerIndent())) containers.push(content);
      paragraphOpen = !NOT_PARAGRAPH.test(line);
    }

    afterBlank = false;
    isCode.push(false);
  }

  return isCode;
}

/**
 * A markdown body with its CODE removed, so a keyword that is being QUOTED is
 * not read as a keyword (#942).
 *
 * The hazard is not hypothetical and was found by the tooling reporting on
 * itself: PR #941 pasted `green-pr-sweep.mjs`'s real output into its
 * description as evidence, that output prints one `clos·es #N` line per row,
 * and the gate read #941 as claiming #403, #859, #870, #905 and #937 on top of
 * its own #893. The gate held it — #870 carries `johan-gated` — which is the
 * cheap half of the cost. The expensive half is that these are GitHub's own
 * closing keywords, so merging such a PR risks closing tickets nobody read as
 * a side effect of pasting evidence. The workaround #941 shipped was to elide
 * the ticket lines from its own quoted output, which throws away exactly the
 * evidence a reviewer came for.
 *
 * Three kinds of code, and the asymmetry of #823 decides each one. A missed
 * gate answers a founder's question for him; a spurious gate costs thirty
 * seconds. So this may only narrow what counts as a body reference where the
 * narrowing is UNAMBIGUOUS:
 *
 *   · FENCED blocks (``` and ~~~) — unambiguous, and the actual hazard: pasted
 *     tool output is fenced essentially always.
 *   · INLINE spans (`closes #N` in prose) — also unambiguous (a backtick run is
 *     closed by the next run of the same length), and needed for the same
 *     reason: a body EXPLAINING this gate quotes its keywords inline, which is
 *     why #942's own text had to spell them `clos·es` with a separator to keep
 *     from doing this to whatever read it. Nobody writes a real closing
 *     directive in backticks, and GitHub would not honour it there either.
 *   · INDENTED blocks (four spaces) — stripped only after a blank line, only
 *     outside a list, and only four columns past the innermost container's own
 *     content indent, because four-space indentation inside a list is ordinary
 *     continuation text rather than code.
 *
 * THE INDENTED GUARD MAY ONLY EVER DECLINE TO STRIP, and that is now true by
 * construction rather than by hope (#953). The line-based scan alone was not
 * container-aware, and its two blind spots both failed the EXPENSIVE way — they
 * stripped prose GitHub renders as prose, hiding a closing keyword GitHub would
 * honour:
 *
 *   · A LAZY CONTINUATION at the margin looked like the end of the list, so the
 *     four-space paragraph after it was read as code — while the same body with
 *     the lazy line removed read correctly. Two spellings of one document, two
 *     answers.
 *   · A fence inside a list item whose closer is indented past three spaces
 *     never closed, so the scanner held it open to EOF and swallowed every
 *     keyword after it. One mis-indented closer blinded the gate for a whole
 *     body.
 *
 * So the body is scanned TWICE by `scanCode` — once line-based, once carrying
 * the innermost container's content indent — and a line is code only where BOTH
 * passes say so. The container-aware pass can therefore only ever hand prose
 * BACK; it cannot take any away, whatever it gets wrong about an exotic
 * container, because the line-based pass is still holding the floor. What is
 * left is over-inclusive in the direction #823 calls cheap: a shape both passes
 * misread stays misread, and telling every such shape apart needs a real
 * CommonMark block parser rather than a scanner.
 *
 * Removed code leaves its newline behind rather than closing the gap, so a
 * keyword and a `#N` that were separated by a fence can still match across it.
 * That too is deliberate: it can only ever add a reference, never hide one.
 *
 * The TITLE is not passed through this. It stays deliberately over-inclusive,
 * per the header.
 */
export function stripCode(text) {
  const lines = String(text ?? "").split("\n");
  const lineBased = scanCode(lines, false);
  const containerAware = scanCode(lines, true);
  const kept = lines.map((line, i) => (lineBased[i] && containerAware[i] ? "" : line));

  // Inline spans last, over the prose that survived: a run of N backticks is
  // closed by the next run of exactly N. An unmatched backtick is a literal
  // and correctly leaves the text around it readable. Pairing is confined to
  // within a paragraph, as CommonMark confines it — otherwise one stray
  // backtick could swallow the rest of a description, and swallowing prose is
  // the direction that HIDES a real closing reference.
  return kept
    .join("\n")
    .split(/(\n[ \t]*\n)/)
    .map((chunk, i) => (i % 2 === 0 ? chunk.replace(/(`+)[\s\S]*?\1(?!`)/g, " ") : chunk))
    .join("");
}

/**
 * The tickets a pull request claims to answer: everything named in the title
 * (house convention) plus everything a closing keyword names in the body's
 * PROSE — see `stripCode` for why quoted keywords do not count (#942).
 *
 * A bare `#N` in the BODY is not a claim — these bodies cite prior tickets by
 * the handful to explain themselves, and treating a citation as a closing
 * reference would refuse merges over footnotes. See the header for why the
 * title is read the other way round.
 */
export function closingTicketRefs({ title = "", body = "" } = {}) {
  const refs = ticketRefs(title);
  for (const found of closingMatches(stripCode(body))) refs.push(found.number);
  return [...new Set(refs)].sort((a, b) => a - b);
}

/**
 * The text that may sit between the start of a line and a closing keyword and
 * still leave that keyword OPENING a clause (#983).
 *
 * Two ways to open one, and the alternation is exactly those two:
 *
 *   · the line's own furniture — a list marker (`- Closes #5`) or nothing at
 *     all (`Closes #978` at the top of a body);
 *   · a clause boundary — `.`, `!`, `?`, `;`, `:` or `,` — which is what makes
 *     `No merge performed. Closes #703.` and `Closes #531, closes #524.` the
 *     two-declaration bodies their authors plainly meant.
 *
 * Either may then be followed by markup that carries no words: blockquote
 * markers, emphasis runs, a closing bracket. Anything else — a verb, a
 * preposition, a negation — means the keyword is mid-clause, and mid-clause it
 * is prose about a ticket rather than a directive.
 */
const DECLARATION_PREFIX = /(?:^[ \t]*(?:[-*+]|\d{1,9}[.)])?|[.!?;:,])[ \t]*[>*_~`)\]]*[ \t]*$/;

/** A prefix whose clause boundary is a COMMA — the one that needs a second look. */
const COMMA_OPENED = /,[ \t]*[>*_~`)\]]*[ \t]*$/;

/**
 * Does the text between the start of a line and a closing keyword leave that
 * keyword OPENING a clause?
 *
 * `DECLARATION_PREFIX` answers it for the line's own furniture and for a
 * sentence that just ended. A COMMA needs one more question asked, and that is
 * the whole of this function (#995's review of #983): a comma continues a LIST,
 * so it opens a declaration only when the clause it closed was itself a closing
 * directive. `Clos·es #531, clos·es #524.` is the two-declaration body its
 * author meant; `unclear whether this fix·es #922, clos·es #923` is one clause
 * of prose and a comma, and reading #923 out of it as a claim is the false
 * declaration this repairs. The question is asked recursively, so a chain
 * (`A, B, C`) is a list of declarations only if it opened as one.
 */
function opensClause(before) {
  if (!DECLARATION_PREFIX.test(before)) return false;
  if (!COMMA_OPENED.test(before)) return true;
  const clause = before.slice(0, before.lastIndexOf(","));
  const tail = clause.match(CLOSING_REFERENCE_TAIL);
  if (!tail) return false;
  return opensClause(clause.slice(0, tail.index));
}

/** A one-line quote of the sentence a match sits in, for the refusal to name. */
function quoteAround(text, index, length) {
  const from = Math.max(0, index - 70);
  const to = Math.min(text.length, index + length + 20);
  const window = text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${window}${to < text.length ? "…" : ""}`;
}

/**
 * Every closing reference in a string THAT WOULD CLOSE A TICKET HERE, with
 * where it sits, whether it opens a clause, and the words around it.
 *
 * The one narrowing is by repository (#991): `clos·es otherowner/otherrepo#5`
 * is a closing reference, but not one against this repository, so it closes
 * nothing on this merge and must not be read either as a declaration or as an
 * incidental close. A bare `#5` and this repository's own qualified spellings
 * are the same ticket and are treated as one.
 *
 * This does NOT strip code; callers decide. `bodyClosings` and
 * `closingTicketRefs` pass code-stripped markdown, because a rendered body is
 * markdown and GitHub does not cross-reference inside a fence (#942). A commit
 * message is not markdown, so `separateUndeclaredClosings` passes it whole.
 */
export function closingMatches(text) {
  const source = String(text ?? "");
  const found = [];
  for (const m of source.matchAll(CLOSING_REFERENCE)) {
    const groups = m.groups ?? {};
    const owner = groups.urlOwner ?? groups.owner ?? null;
    const repo = groups.urlRepo ?? groups.repo ?? null;
    if (owner && `${owner}/${repo}`.toLowerCase() !== REPO.toLowerCase()) continue;
    const lineStart = source.lastIndexOf("\n", Math.max(0, m.index - 1)) + 1;
    found.push({
      number: Number(groups.urlNumber ?? groups.number),
      index: m.index,
      text: m[0],
      qualified: Boolean(owner),
      declared: opensClause(source.slice(lineStart, m.index)),
      quote: quoteAround(source, m.index, m[0].length),
    });
  }
  return found;
}

/**
 * What a merge of this body will CLOSE, split by whether the body meant it
 * (#983).
 *
 * `declared` — closing directives that open a clause. These are claims: the
 * author wrote them to close those tickets, and GitHub obliging is the point.
 *
 * `incidental` — the same keywords used mid-clause, as verbs. GitHub will close
 * these too and cannot be told not to, which is why the gate refuses on them
 * rather than merely reporting them. Each carries the words it found, so the
 * refusal can quote the sentence instead of sending the reader hunting.
 *
 * A number that appears BOTH ways is not incidental: `Closes #978.` earlier in
 * a body settles the question for every later "this fixes #978" in the prose.
 * The close was declared; a second mention of the same ticket adds no new one.
 *
 * The BODY only, and code-stripped like `closingTicketRefs` — a keyword the
 * body is quoting is not a claim (#942), and a title cannot authorise a close
 * because GitHub never reads one (see the header).
 */
export function bodyClosings(body = "") {
  const found = closingMatches(stripCode(body));
  const declared = [...new Set(found.filter((f) => f.declared).map((f) => f.number))].sort(
    (a, b) => a - b,
  );
  const seen = new Set(declared);
  const incidental = [];
  for (const f of found) {
    if (f.declared || seen.has(f.number)) continue;
    seen.add(f.number);
    incidental.push({ number: f.number, quote: f.quote });
  }
  return { declared, incidental };
}

/**
 * The separator this repository already uses to quote a closing keyword without
 * arming it (#942): `clos·es`, `clos·ed`, `fix·ed`. It is not one of GitHub's
 * keywords, so a reference spelled with it links nothing and closes nothing,
 * and a reader still sees exactly which word was written.
 */
export const CLOSING_SEPARATOR = "·";

/** `closes` -> `clos·es`, `fix` -> `fi·x`. Case and length are preserved. */
export function separateClosingKeyword(word) {
  const at = word.length >= 5 ? 4 : 2;
  return `${word.slice(0, at)}${CLOSING_SEPARATOR}${word.slice(at)}`;
}

/**
 * `text` with every closing reference that names a ticket OUTSIDE `declared`
 * disarmed by the separator (#995), and a list of what was disarmed.
 *
 * Only the KEYWORD is touched; the ticket number, the surrounding sentence and
 * every other character survive, so the sentence still reads and still says
 * which ticket it is about. Nothing is deleted and nothing is reordered — the
 * one thing that changes is whether GitHub reads the words as an instruction.
 *
 * `declared` is the set the BODY declared, so a ticket the pull request really
 * does claim keeps its keyword intact and still closes. Everything else in a
 * commit message is narration about a ticket, whatever position it sits in.
 */
export function separateUndeclaredClosings(text, declared = []) {
  const source = String(text ?? "");
  const keep = new Set(declared.map(Number));
  const separated = [];
  let out = "";
  let cursor = 0;
  for (const found of closingMatches(source)) {
    if (keep.has(found.number)) continue;
    const keyword = found.text.match(CLOSING_KEYWORD_HEAD)?.[0] ?? "";
    out +=
      source.slice(cursor, found.index) +
      separateClosingKeyword(keyword) +
      found.text.slice(keyword.length);
    cursor = found.index + found.text.length;
    separated.push({ number: found.number, quote: found.quote });
  }
  return { text: out + source.slice(cursor), separated };
}

/**
 * The squash commit GitHub would compose for this pull request, composed here
 * instead (#995).
 *
 * This mirrors the repository's own merge settings rather than inventing a
 * format, so supplying the message changes nothing about `main`'s history
 * except that the gate has now read it:
 *
 *   squash_merge_commit_title: COMMIT_OR_PR_TITLE — one commit lends its
 *     subject, several fall back to the pull request's title;
 *   squash_merge_commit_message: COMMIT_MESSAGES — one commit's body verbatim,
 *     several as `* <message>` blocks, which is the shape every multi-commit
 *     squash on `main` already has.
 *
 * GitHub appends ` (#N)` to the title it composes; supplying `commit_title`
 * does not, so it is appended here. That suffix is this repository's whole
 * convention for reading `git log` back against the board.
 */
export function composeSquashMessage({ title = "", prNumber, commits = [] } = {}) {
  const list = commits ?? [];
  const only = list.length === 1 ? String(list[0]?.message ?? "") : null;
  const subject = only === null ? String(title) : only.split("\n")[0].trim();
  const message =
    only === null
      ? list.map((commit) => `* ${String(commit?.message ?? "").trim()}`).join("\n\n")
      : only.slice(only.split("\n")[0].length).replace(/^\n+/, "").trimEnd();
  return { title: `${subject} (#${prNumber})`, message };
}

/**
 * The exact squash commit this merge will create: composed like GitHub's, then
 * disarmed of every closing keyword the body did not declare (#995).
 *
 * The trailer exists so that `git log` explains itself. A reader who finds
 * `clos·ed` in a commit message on `main` should not have to guess who wrote it
 * that way or why, and the alternative — an unexplained edit to an author's
 * words — is the kind of quiet rewriting that makes a tool untrustworthy.
 */
export function squashPlan({ title = "", prNumber, commits = [], declared = [] } = {}) {
  const composed = composeSquashMessage({ title, prNumber, commits });
  const head = separateUndeclaredClosings(composed.title, declared);
  const body = separateUndeclaredClosings(composed.message, declared);
  const separated = [...head.separated, ...body.separated];
  const numbers = [...new Set(separated.map((s) => s.number))].sort((a, b) => a - b);
  const trailer = numbers.length
    ? `\n\nClosing keywords narrating ${numbers.map((n) => `#${n}`).join(", ")} were separated ` +
      `(\`clos${CLOSING_SEPARATOR}es\`) by scripts/merge-pr.mjs: PR #${prNumber}'s body does not ` +
      "declare them, and GitHub honours a closing keyword in a commit message exactly as it " +
      "does in a body (nc#995)."
    : "";
  return { title: head.text, message: `${body.text}${trailer}`.trim(), separated };
}

/*
 * The `build` check takes ~2m35s (#594), and on a busy day it queues behind
 * other sessions' runs before it even starts.
 *
 * POLL_INTERVAL_MS = 15s: the merge fires within 15 seconds of green, against
 * a ~155s build. Polling every 5s would buy ten seconds off that and triple
 * the API traffic; polling every minute would give back a third of what --wait
 * exists to save.
 *
 * WAIT_TIMEOUT_MS = 15min: ~5.8x the build, which covers a queued start, a
 * re-run, and a moderately backed-up runner pool, while still being short
 * enough that a wedged wait is noticed within one shift rather than holding a
 * session open indefinitely. Worst case that is 60 polls x 3 API calls = 180
 * requests against a 5000/hour limit.
 */
export const POLL_INTERVAL_MS = 15_000;
export const WAIT_TIMEOUT_MS = 15 * 60 * 1000;

export const USAGE =
  "Usage: node scripts/merge-pr.mjs <pr-number> [--wait] [--dry-run] " +
  '[--admin-override "reason"] [--johan-cleared "#123 where Johan answered"]';

/**
 * The REST transport, run as a child so this file can stay synchronous
 * (nc#1205). Re-exported rather than re-derived: `github-api.mjs` is the file
 * being spawned, so it is the one place that can name itself without a second
 * path expression to keep in step.
 */
export { API_HELPER };

/**
 * HOW MUCH OF AN API ANSWER THIS GATE READS — and why the number is no longer
 * here (#837, nc#1206, nc#1261).
 *
 * `execFileSync` caps a child's stdout at 1 MiB by default and KILLS the child
 * on overrun — `ENOBUFS`, thrown before a single gate has been evaluated. That
 * is how the merge of #749 died at head `beff92e8ca`: the compare payload of a
 * branch carrying large evidence bundles is comfortably over a megabyte, the
 * head was genuinely current, every required check was green, and the only
 * merge path this repository permits could not read far enough to say so. A
 * gate that cannot read its evidence is not a stricter gate — it is an
 * unavailable one, and unavailability is the pressure that sends someone to the
 * bare `gh pr merge` this script exists to replace.
 *
 * THIS GATE USED TO CARRY ITS OWN CONSTANT, `GH_MAX_BUFFER` at 32 MiB, beside
 * `github-api.mjs`'s `DEFAULT_MAX_BUFFER` at 64 MiB. Two numbers for one
 * mechanism, and no measurement ever separated them: the gate's predates the
 * sweeps'. Where a ceiling is wrong in one direction it turns a readable answer
 * into a crash — the failure both were written for — and where it is wrong in
 * the other nothing observed has ever cost anything, so the larger of the two
 * is the one that survives. The gate now takes `ghApiSync`'s default and names
 * no number of its own.
 *
 * The reads that CAN be narrowed are still narrowed (see `readBehindBy`),
 * because not fetching a megabyte beats buffering one.
 */

/**
 * Which transport the call site actually spawns.
 *
 * `NC_MERGE_API_HELPER` exists so a test can drive the REAL call site — the one
 * that carries `maxBuffer` — against a payload it controls, which is what
 * #1070 found no test was doing. It replaces the seam the old implementation
 * had for free: that one took whatever `gh` PATH resolved to, and the
 * regression test for #837 worked by putting a fake `gh` first on PATH. So this
 * is the same trust as before, named instead of implicit — an environment that
 * can set this variable can already set `PATH`, `GH_TOKEN`, or edit this file.
 */
function apiHelperPath(env = process.env) {
  return env.NC_MERGE_API_HELPER || API_HELPER;
}

/**
 * One GitHub call, in `gh api` argument shape, answered over REST (nc#1205).
 *
 * There is no `gh` here any more. The argument shape survives it because every
 * call site and every test speaks it, and because the shape was never the
 * problem — the dependency was.
 *
 * ── THE SPAWN IS WRITTEN ONCE, AND THIS IS NOT WHERE (nc#1261) ─────────────
 *
 * The parent half of the transport — the child process, the raised buffer, the
 * `NODE_USE_ENV_PROXY=1` the proxied containers need, the captured stderr, the
 * `?? ""` that catches an uncaptured stdout — is `ghApiSync` in
 * `scripts/github-api.mjs`, which carries the reasoning for every one of them
 * and the tests that hold them. This gate held a second copy from nc#1206 until
 * nc#1261, kept in step by a guard on one side and a spec on the other rather
 * than by a shared function, which is the shape that drifts: the two details
 * both copies encoded are the two that cost nc#1205 an afternoon each when they
 * were absent, and the buffer had already drifted to two different numbers.
 *
 * WHAT STAYS HERE IS THE ONE THING THAT IS THIS GATE'S: `apiHelperPath`, the
 * `NC_MERGE_API_HELPER` seam a test drives the real call site through. It is
 * passed as `helperPath` rather than left to the transport's default, so the
 * #1141 regression test still exercises this line and not a stand-in.
 *
 * The per-call options argument is gone with the copy. It was forwarded to
 * `execFileSync` and no call site has passed one since #859 stopped asking for
 * `stdio: "inherit"` on the merge — a pass-through with no caller and no test,
 * which is the same thing the copy was. `ghApiSync` still takes options for a
 * caller that one day needs them, and has the tests to say what they do.
 *
 * `guard-mutation-check`'s `test/merge-gate-max-buffer-dropped` entry moved
 * with the mechanism. It now deletes the allowance from `ghApiSync` itself, so
 * the same mutation that used to break only this gate breaks every caller of
 * the transport — a stronger guard than the one it replaces, and pointed at the
 * only place the allowance now lives.
 */
function gh(args) {
  return ghApiSync(args, { helperPath: apiHelperPath() });
}

function fail(msg) {
  console.error(`\nmerge-pr: REFUSED — ${msg}`);
  console.error("Fix the condition and run again. (Emergency only: --admin-override \"reason\".)");
  process.exit(1);
}

/** Block the (synchronous) script for `ms` without spawning a process per nap. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** "2m35s" / "45s" — for progress lines and the timeout refusal. */
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

/** Flags that stand alone. */
const KNOWN_FLAGS = new Set(["--wait", "--dry-run"]);
/** Flags whose next argument, when it is not itself a flag, is their written reason. */
const REASON_FLAGS = new Set(["--admin-override", "--johan-cleared"]);

/**
 * Parsed from `process.argv.slice(2)`. `override` is `null` when the flag is
 * absent and `""` when it is present without a reason, because those two are
 * different failures: one is an ordinary run, the other is a typo that must
 * not silently become an unexplained override.
 *
 * THE SAME REASONING ONE LEVEL UP: an argument this script does not know sets
 * `usageError` and lists itself in `unknown`, so a typo cannot silently become
 * a merge (#1242). It did once — `node scripts/merge-pr.mjs 1238 --dry-run`
 * dropped the flag on the floor and merged, because this function read four
 * arguments and ignored everything else without a word. The trap was that the
 * sibling repository's script of the same name, worked by the same people in
 * the same session, does support that flag: the same command was a preview
 * there and an irreversible merge here. `--dry-run` is implemented below for
 * that reason, and unknown arguments refuse so the NEXT wrong flag is loud
 * rather than silent.
 */
export function parseArgs(argv) {
  const prNumber = argv[0];
  if (!prNumber || !/^\d+$/.test(prNumber)) return { usageError: true };

  const unknown = [];
  for (let at = 1; at < argv.length; at += 1) {
    const arg = argv[at];
    if (KNOWN_FLAGS.has(arg)) continue;
    if (REASON_FLAGS.has(arg)) {
      // The reason is arbitrary prose belonging to its flag — never an
      // argument of its own, or every override reason would be "unrecognised".
      const reason = argv[at + 1];
      if (reason !== undefined && !reason.startsWith("--")) at += 1;
      continue;
    }
    unknown.push(arg);
  }
  if (unknown.length > 0) return { usageError: true, unknown };

  const wait = argv.includes("--wait");
  // A following flag is not a reason. Without this, `--admin-override --wait`
  // would record "--wait" as the written justification for the override.
  const writtenReason = (flag) => {
    const at = argv.indexOf(flag);
    if (at === -1) return null;
    const reason = argv[at + 1];
    return reason && !reason.startsWith("--") ? reason : "";
  };
  return {
    prNumber,
    override: writtenReason("--admin-override"),
    cleared: writtenReason("--johan-cleared"),
    wait,
    dryRun: argv.includes("--dry-run"),
  };
}

/**
 * The newest check-run with this name, or null. Newest wins so that a re-run
 * supersedes the run it replaced — including when the re-run is still in
 * flight and the superseded one was green.
 *
 * WITH ONE EXCEPTION, AND IT IS A LIVELOCK (#859).
 *
 * A force-push started two runs on ONE SHA and GitHub's concurrency group
 * cancelled the NEWER of them. Newest-by-`started_at` therefore selected the
 * cancelled run, and the gate refused a pull request that carried a green
 * `build` on that exact commit. Nothing could clear it in band —
 * `POST actions/runs/:id/rerun` answers `403 Resource not accessible by
 * integration` for this token — so the only escape was a fresh SHA and another
 * ~5-minute build, against a main taking a sibling merge every ~7 minutes. One
 * PR needed four rebases to land through that window (#854).
 *
 * A CANCELLATION IS THE ABSENCE OF A RESULT, NOT A NEGATIVE ONE. The runs are
 * on the same commit: a green build there concluded successfully about exactly
 * this code, and a duplicate the scheduler killed says nothing that unsays it.
 * So a cancelled run is passed over whenever any other run of the same name
 * exists on the SHA — which keeps every distinction this file already draws:
 *
 *   · an in-flight re-run STILL supersedes the green it replaced (it is a
 *     result on the way, and the gate waits for it);
 *   · a red is STILL a red — a later cancellation never launders a failure,
 *     because a failure is not cancelled;
 *   · when a cancelled run is ALL there is, it is still returned, so the
 *     refusal names it rather than pretending no check ran.
 *
 * This is the only relaxation: the run finally selected must still be
 * completed/success for anything to merge.
 */
export function latestCheckRun(checkRuns, name) {
  const matching = (checkRuns ?? []).filter((run) => run.name === name);
  if (matching.length === 0) return null;
  const decisive = matching.filter((run) => run.conclusion !== "cancelled");
  const candidates = decisive.length > 0 ? decisive : matching;
  return candidates.slice().sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];
}

/**
 * A failed check-run whose whole life fits inside this window never ran a
 * step: GitHub refused the job before it started. During the #650 spending-
 * limit outage every run "failed" this way in ~3 seconds, and eight red PRs
 * were merged around this gate that night by readers who took those reds for
 * infrastructure noise (#679). They were — but noise is not green.
 */
export const REFUSAL_SIGNATURE_MS = 15_000;

/**
 * Names the kind of red being refused, when it can (#679). Returns a sentence
 * to append to the refusal for a completed-failure run bearing the Actions-
 * refusal signature, and null for every other run. The VERDICT never changes —
 * a refusal-signature red refuses exactly like a real one — what changes is
 * the operator's next move: fix the Actions outage (#650) instead of debugging
 * a test that never ran, and never read the outage as a licence to merge.
 */
export function refusalSignature(run) {
  if (!run || run.conclusion !== "failure") return null;
  const started = Date.parse(run.started_at ?? "");
  const completed = Date.parse(run.completed_at ?? "");
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null;
  const lifeMs = completed - started;
  if (lifeMs < 0 || lifeMs > REFUSAL_SIGNATURE_MS) return null;
  return (
    ` This red bears the Actions-refusal signature (concluded in ${Math.round(lifeMs / 1000)}s, ` +
    "zero steps): GitHub refused to run the job at all — a spending-limit or platform " +
    "block (#650), not a test failure. Fix the outage; an outage is not a licence to " +
    "merge around this refusal (#679)."
  );
}

/**
 * The whole gate as one pure decision: facts in, `merge` / `wait` / `refuse`
 * out. Pure so that the parts of this script that can actually be wrong are
 * testable without a network, a repo, or a transport.
 *
 * `wait: false` (the default, and every caller who does not pass --wait) can
 * never return `wait`: each waitable condition collapses to exactly the
 * refusal it produced before #594, with the same wording.
 */
export function evaluateGates(state) {
  const {
    prNumber,
    title = "",
    body = "",
    prState,
    baseRef,
    draft = false,
    headSha,
    mergeable,
    mergeableState,
    behindBy = 0,
    commits = null,
    commitCount = null,
    checkRuns = [],
    linkedIssues = [],
    clearedTickets = [],
    override = false,
    wait = false,
    waitExpired = false,
    waitBudgetMs = WAIT_TIMEOUT_MS,
  } = state;

  const notes = [];
  const warnings = [];
  const sha10 = String(headSha ?? "").slice(0, 10);

  const refuse = (reason) => ({ verdict: "refuse", reason, notes, warnings });

  /*
   * A condition time can fix on its own. Without --wait it is the refusal it
   * has always been. With --wait we hold — and when the budget is gone it
   * becomes that same refusal again, with the wait on the record, so a timeout
   * still tells the operator what was actually wrong.
   */
  const waitable = (waitingFor, reason) => {
    if (!wait) return refuse(reason);
    if (waitExpired) {
      return refuse(
        `${reason} (waited ${formatDuration(waitBudgetMs)} for this to change; giving up)`,
      );
    }
    return { verdict: "wait", waitingFor, notes, warnings };
  };

  // 1. Identity. None of these undo themselves, so none of them are waitable.
  if (prState !== "open") return refuse(`PR #${prNumber} is ${prState}, not open`);
  if (baseRef !== "main") return refuse(`PR targets '${baseRef}', not main`);
  if (draft) return refuse("PR is a draft");

  notes.push(`PR #${prNumber}: "${title}"`);
  notes.push(`head ${sha10} -> ${baseRef}`);

  // 2. What this merge will CLOSE, and whether the body meant to say it (#983).
  //
  // Named before the list is printed, because the list is only worth printing
  // once we can say where it came from. It comes from the title and body READ
  // AT MERGE TIME — this poll's copy, not a stored association, not the body
  // that was there when the PR opened.
  const closings = bodyClosings(body);
  if (linkedIssues.length > 0) {
    const declared = closings.declared.length
      ? `declared by the body: ${closings.declared.map((n) => `#${n}`).join(", ")}`
      : "the body declares none";
    notes.push(
      `closes ${linkedIssues.map((issue) => `#${issue.number}`).join(", ")} ` +
        `(source: this PR's title and body as read at merge time — ${declared})`,
    );
  }

  if (closings.incidental.length > 0) {
    const named = closings.incidental
      .map((ref) => `#${ref.number}, in "${ref.quote}"`)
      .join("; and ");
    const numbers = closings.incidental.map((ref) => `#${ref.number}`).join(", ");
    return refuse(
      `merging this would close ${numbers}, and this body never declares that it does. ` +
        `GitHub honours a closing keyword ANYWHERE in a body, including mid-sentence: ` +
        `${named}. That is prose about a ticket, not a claim on it — but GitHub cannot ` +
        `tell the two apart, so it closes the ticket anyway. It closed #977 on PR #981 ` +
        `and #922 on PR #930, whose body said in as many words that it does not (#983). ` +
        `Fix the TEXT, not the gate: either declare it at the start of a clause ` +
        `("Closes ${numbers.split(",")[0].trim()}."), or rephrase so the keyword does not ` +
        `sit next to the number ("addressed ${numbers.split(",")[0].trim()}"), or put the ` +
        `keyword in backticks if you are quoting one. Then re-run.`,
    );
  }

  // 2b. The other channel GitHub closes from: the message of the squash commit
  // this merge will write onto main (#995). It is not read and refused, it is
  // COMPOSED — see the header for why a refusal is the wrong instrument here.
  if (commits == null || commits.length === 0) {
    return refuse(
      `could not read the commits of PR #${prNumber}` +
        `${commits ? " (the API returned none)" : ""}. The squash commit's MESSAGE closes ` +
        "issues exactly as the body does (#995), so this gate composes that message rather " +
        "than leaving it to GitHub — and it cannot compose one from commits it could not " +
        "read. Absence is not success (#535). Re-run when the API answers.",
    );
  }
  if (commitCount != null && commitCount !== commits.length) {
    return refuse(
      `read ${commits.length} of PR #${prNumber}'s ${commitCount} commits. The squash message ` +
        "is composed from all of them (#995), and composing it from part of the branch would " +
        "drop the rest of the branch's own account of itself from main. Split the PR.",
    );
  }
  const squash = squashPlan({ title, prNumber, commits, declared: closings.declared });
  notes.push(
    `squash message: composed here from ${commits.length} commit(s), not by GitHub (#995)` +
      `${squash.separated.length ? `; ${squash.separated.length} closing keyword(s) separated` : ""}`,
  );
  for (const sep of squash.separated) {
    warnings.push(
      `separated a closing keyword naming #${sep.number} in the squash message — this PR's ` +
        `body does not declare that close, so it stays narration: "${sep.quote}". Left alone, ` +
        `GitHub would have closed #${sep.number} on this merge, which is how PR #989 closed ` +
        "#922 (#995). To close it, declare it in the BODY and re-run.",
    );
  }

  // 3. The content gate (#823). BEFORE mergeability and BEFORE the build, and
  // never waitable: a build cannot answer this and time cannot dissolve it, so
  // there is nothing to be gained by making the operator wait to hear it.
  const unreadable = linkedIssues.filter((issue) => issue.labels == null);
  if (unreadable.length > 0) {
    const names = unreadable.map((issue) => `#${issue.number}`).join(", ");
    return refuse(
      `could not read the labels of ${names} (${unreadable[0].error ?? "no reason given"}). ` +
        "Absence of a label is not evidence of no gate — an unreadable ticket is refused, " +
        "not assumed open (#823). Re-run when the API answers.",
    );
  }
  const gated = linkedIssues
    .map((issue) => ({
      ...issue,
      gates: (issue.labels ?? []).filter((label) => CONTENT_GATE_LABELS.includes(label)),
    }))
    .filter((issue) => issue.gates.length > 0);
  const uncleared = gated.filter((issue) => !clearedTickets.includes(Number(issue.number)));
  if (uncleared.length > 0) {
    const named = uncleared
      .map(
        (issue) => `#${issue.number} carries ${issue.gates.map((g) => `'${g}'`).join(" and ")}`,
      )
      .join("; ");
    const numbers = uncleared.map((issue) => `#${issue.number}`).join(", ");
    return refuse(
      `${named}, and PR #${prNumber} closes it. A GREEN BUILD CANNOT CLEAR A CONTENT GATE: ` +
        `the checks say this code compiles and does not conflict, they cannot say Johan has ` +
        `answered the question ${numbers} asks — and merging it here answers it for him ` +
        `(#823). Take it to Johan. If he has already answered, record WHERE: ` +
        `--johan-cleared "${uncleared[0].number ? `#${uncleared[0].number}` : "#N"} — <where he said so>", ` +
        "which names the ticket in the shell history and in this merge report.",
    );
  }
  for (const issue of gated) {
    warnings.push(
      `JOHAN GATE CLEARED BY HAND: #${issue.number} (${issue.gates.join(", ")}) — merging on ` +
        "a recorded answer from Johan, not on the strength of the build.",
    );
  }

  // 4. Mergeability. GitHub computes this lazily, so an unknown is worth
  // waiting on; a conflict is not — it needs a rebase.
  if (mergeable !== true) {
    const reason =
      `GitHub reports mergeable=${mergeable} (state: ${mergeableState}). ` +
      "A conflicted PR gets no CI at all (#535) — rebase it first.";
    if (mergeable === null) return waitable("GitHub is still computing mergeability", reason);
    return refuse(reason);
  }

  // 5. Strict up-to-date with main. Checked BEFORE the build on purpose: if
  // the head is already stale we would only be waiting on a build whose result
  // we are going to refuse anyway.
  if (behindBy > 0 && !override) {
    return refuse(
      `head is ${behindBy} commit(s) behind main. Rebase or merge main in, ` +
        "let checks re-run on the new head, then merge. This closes the " +
        "parallel-session collision window that produced #535.",
    );
  }

  // 6. The build, on this exact SHA.
  const build = latestCheckRun(checkRuns, BUILD_CHECK);
  if (!build) {
    return waitable(
      `no '${BUILD_CHECK}' check-run on ${sha10} yet`,
      `no '${BUILD_CHECK}' check-run exists on head ${sha10}. ` +
        "Absence is not success — the #535 failure mode is precisely a check " +
        "that silently never ran.",
    );
  }
  const buildVerdict = `${build.status}/${build.conclusion ?? "no conclusion"}`;
  const buildReason =
    `check '${BUILD_CHECK}' on head ${sha10} is ${buildVerdict} — need completed/success.`;
  if (build.status !== "completed") {
    return waitable(`'${BUILD_CHECK}' is ${build.status} on ${sha10}`, buildReason);
  }
  if (build.conclusion !== "success") {
    return refuse(buildReason + (refusalSignature(build) ?? ""));
  }
  notes.push(`check '${BUILD_CHECK}': success (${build.html_url})`);

  // 7. Whose name is on the commits, on this exact SHA (#958). Same shape as
  // the build and deliberately so: absence is not success, and there is no
  // fallback field to accept in its place the way `mergeable` has one. A red
  // here is a provenance refusal — the remedy is in the check's own output
  // (re-author, or, for an Update-branch merge commit, rebase), never a merge
  // around it.
  const identity = latestCheckRun(checkRuns, IDENTITY_CHECK);
  if (!identity) {
    return waitable(
      `no '${IDENTITY_CHECK}' check-run on ${sha10} yet`,
      `no '${IDENTITY_CHECK}' check-run exists on head ${sha10}. ` +
        "Absence is not success — nothing else here reads the git author field, " +
        "so an absent identity run leaves 'whose name is on these commits' " +
        "unanswered (#958). Push or rebase to make one run.",
    );
  }
  const identityVerdict = `${identity.status}/${identity.conclusion ?? "no conclusion"}`;
  const identityReason =
    `check '${IDENTITY_CHECK}' on head ${sha10} is ${identityVerdict} — need completed/success.`;
  if (identity.status !== "completed") {
    return waitable(`'${IDENTITY_CHECK}' is ${identity.status} on ${sha10}`, identityReason);
  }
  if (identity.conclusion !== "success") {
    return refuse(
      identityReason +
        " A commit in this range claims an identity it is not entitled to. Read the run's " +
        "output: if the offender is a `Merge branch 'main' into …` commit, GitHub's " +
        "Update branch button made it — rebase the branch, do not re-author the merge " +
        "(#958)." +
        (refusalSignature(identity) ?? ""),
    );
  }
  notes.push(`check '${IDENTITY_CHECK}': success (${identity.html_url})`);

  // 8. The mergeable check-run, with the documented fallback for PRs that
  // predate pr-merge-check.yml. Absence stays a warning-and-accept rather than
  // something to wait on: we cannot tell "workflow does not exist for this PR"
  // from "has not started", and turning the first into a 15-minute stall would
  // be a policy change.
  const mergeCheck = latestCheckRun(checkRuns, MERGEABLE_CHECK);
  if (!mergeCheck) {
    warnings.push(
      `warning: no '${MERGEABLE_CHECK}' check-run on ${sha10} ` +
        "(PR predates pr-merge-check.yml); accepting API mergeable=true in its place.",
    );
    return { verdict: "merge", notes, warnings, squash };
  }
  const mergeVerdict = `${mergeCheck.status}/${mergeCheck.conclusion ?? "no conclusion"}`;
  const mergeReason =
    `check '${MERGEABLE_CHECK}' on head ${sha10} is ${mergeVerdict} — need completed/success.`;
  if (mergeCheck.status !== "completed") {
    return waitable(`'${MERGEABLE_CHECK}' is ${mergeCheck.status} on ${sha10}`, mergeReason);
  }
  if (mergeCheck.conclusion !== "success") {
    return refuse(mergeReason + (refusalSignature(mergeCheck) ?? ""));
  }
  notes.push(`check '${MERGEABLE_CHECK}': success (${mergeCheck.html_url})`);

  return { verdict: "merge", notes, warnings, squash };
}

/**
 * One referenced ticket, as far as the label gate is concerned (#823).
 *
 * `labels: null` means GitHub could not be asked, and the gate refuses on it.
 * A 404 is not that: a number that is not a ticket in this repository is an
 * ANSWER, and so is a reference that resolves to a pull request. Both come back
 * with no labels and no gate.
 *
 * `api` is injectable so the parsing and the classification are testable
 * without a network or a transport, like every other decision in this file.
 */
export function readTicket(number, { api = gh } = {}) {
  try {
    const issue = JSON.parse(api(["api", `repos/${REPO}/issues/${number}`]));
    if (issue.pull_request) return { number, kind: "pull-request", labels: [] };
    return {
      number,
      kind: "issue",
      title: issue.title,
      labels: (issue.labels ?? []).map((label) => label?.name ?? String(label)),
    };
  } catch (error) {
    const text = `${error?.stderr ?? ""}\n${error?.message ?? error}`;
    if (/404|not found/i.test(text)) return { number, kind: "missing", labels: [] };
    return {
      number,
      kind: "unreadable",
      labels: null,
      error: text.split("\n").map((line) => line.trim()).filter(Boolean)[0] ?? "unknown error",
    };
  }
}

/*
 * A pull request object can lag its own branch by a few seconds after a push:
 * `pulls/:n` served the PREVIOUS head, and the gate then judged a commit that
 * was no longer there — an old build, an old distance from main — and refused a
 * PR that had just been rebased green. That is the other spurious refusal #859
 * records, and it compounds with the cancelled-run one: two independent ways to
 * refuse a genuinely green head on the night the office is busiest.
 *
 * The branch ref is the authority on what the head IS, so the fix is to ask it
 * and re-read the PR until GitHub's copy agrees. Five tries at 2s covers the
 * observed lag without becoming a wait loop of its own; --wait is where waiting
 * belongs.
 */
export const HEAD_SETTLE_ATTEMPTS = 5;
export const HEAD_SETTLE_INTERVAL_MS = 2000;

/**
 * The head branch's actual tip, or null when it cannot be read.
 *
 * Null is deliberate rather than an error: a fork this token cannot read, a
 * branch already deleted, a rate limit. None of those are facts about the pull
 * request, and none may become a refusal — they only cost us the settle.
 */
export function branchTip(pr, { api = gh } = {}) {
  const repo = pr?.head?.repo?.full_name ?? REPO;
  const ref = pr?.head?.ref;
  if (!ref) return null;
  try {
    return JSON.parse(api(["api", `repos/${repo}/git/ref/heads/${ref}`]))?.object?.sha ?? null;
  } catch {
    return null;
  }
}

/**
 * The pull request, re-read while GitHub's copy of it is behind the head
 * branch's tip (#859). Returns the freshest object it managed to get; if the
 * two never agree it returns the last read rather than refusing, because the
 * merge call now names its sha and GitHub itself will decline a head that moved
 * (see `mergePullRequest`) — an unhelpful refusal is not worth inventing here.
 */
export function readPullRequest(prNumber, { api = gh, sleep = sleepSync, log = () => {} } = {}) {
  const read = () => JSON.parse(api(["api", `repos/${REPO}/pulls/${prNumber}`]));
  let pr = read();
  const tip = branchTip(pr, { api });
  if (!tip || pr.head?.sha === tip) return pr;

  log(
    `PR API still reports head ${String(pr.head?.sha ?? "").slice(0, 10)}, but ` +
      `${pr.head?.ref} is at ${tip.slice(0, 10)}; waiting for it to catch up.`,
  );
  for (let i = 0; i < HEAD_SETTLE_ATTEMPTS && pr.head?.sha !== tip; i++) {
    sleep(HEAD_SETTLE_INTERVAL_MS);
    pr = read();
  }
  return pr;
}

/**
 * The pull request's commits, in order, or null when they could not be read
 * (#995) — null refuses, because a message cannot be composed from commits
 * nobody could fetch. One page: GitHub's own cap on this endpoint is 250, and
 * the count is checked against `pr.commits` so a truncation refuses rather than
 * quietly landing half a branch's account of itself.
 */
export function readPullRequestCommits(prNumber, { api = gh } = {}) {
  try {
    const page = JSON.parse(api(["api", `repos/${REPO}/pulls/${prNumber}/commits?per_page=100`]));
    if (!Array.isArray(page)) return null;
    return page.map((entry) => ({
      sha: entry?.sha ?? "",
      message: entry?.commit?.message ?? "",
    }));
  } catch {
    return null;
  }
}

/**
 * How many commits main is ahead of `headSha` — the ONE fact this gate takes
 * from the compare endpoint (#837).
 *
 * Asked for with `--jq`, so `gh` hands back an integer instead of the whole
 * comparison. The full payload carries every commit and every file patch
 * between the two refs; on a branch that preserves large evidence bundles that
 * is megabytes of JSON out of which this script reads a single number. #749's
 * was over 1 MB and killed the read outright. Narrowing the request REMOVES the
 * payload rather than surviving it, which is the honest fix for the call that
 * actually blew up; the transport's `DEFAULT_MAX_BUFFER` is the floor under the
 * reads (check-runs, commits, the PR body) that cannot be narrowed down to one
 * field.
 *
 * The answer is parsed defensively either way: a whole comparison object is
 * accepted too, so the gate does not become dependent on `--jq` being honoured
 * by whatever `gh` is on PATH. What is NOT accepted is an answer with no
 * integer in it — that THROWS, because `evaluateGates` reads a missing
 * `behindBy` as zero and an unread comparison must never quietly pass for "up
 * to date". Absence is not evidence, which is the whole of #535.
 */
export function readBehindBy(headSha, { api = gh } = {}) {
  const raw = String(
    api(["api", `repos/${REPO}/compare/main...${headSha}`, "--jq", ".behind_by"]) ?? "",
  ).trim();
  const behindBy = /^\d+$/.test(raw) ? Number(raw) : behindByOf(raw);
  if (!Number.isInteger(behindBy) || behindBy < 0) {
    throw new Error(
      `compare main...${String(headSha).slice(0, 10)} did not answer behind_by ` +
        `(got ${JSON.stringify(raw.slice(0, 80))}). Refusing to guess: a comparison ` +
        "this script could not read is not evidence that the head is up to date (#535).",
    );
  }
  return behindBy;
}

/** `behind_by` out of a whole comparison object, or undefined if it is not one. */
function behindByOf(raw) {
  try {
    return JSON.parse(raw)?.behind_by;
  } catch {
    return undefined;
  }
}

/**
 * Everything the gate judges, read fresh from GitHub.
 *
 * `api` is injectable for the same reason it is on `readTicket` and
 * `mergePullRequest`: what this repository can get wrong here is the READING,
 * and #837 is the proof — the gate crashed on a payload size, on a pull request
 * whose every gate was green. So the fact-collection is testable without a
 * network or `gh` on PATH, like every decision in this file.
 */
export function collectFacts(
  prNumber,
  { api = gh, sleep = sleepSync, log = (line) => console.log(line) } = {},
) {
  const pr = readPullRequest(prNumber, { api, sleep, log });

  let mergeable = pr.mergeable;
  let mergeableState = pr.mergeable_state;
  for (let i = 0; i < 5 && mergeable === null; i++) {
    sleep(3000);
    const again = JSON.parse(api(["api", `repos/${REPO}/pulls/${prNumber}`]));
    mergeable = again.mergeable;
    mergeableState = again.mergeable_state;
  }

  const headSha = pr.head.sha;
  const behindBy = readBehindBy(headSha, { api });
  const commits = readPullRequestCommits(prNumber, { api });
  const runs = JSON.parse(
    api(["api", `repos/${REPO}/commits/${headSha}/check-runs?per_page=100`]),
  ).check_runs;

  // Re-read on every poll like everything else: a label can be added to a
  // ticket while a --wait is in flight, and the answer that matters is the one
  // that is true at the moment of the merge call.
  const linkedIssues = closingTicketRefs({ title: pr.title, body: pr.body }).map((number) =>
    readTicket(number, { api }),
  );

  return {
    prNumber,
    title: pr.title,
    // Re-read on every poll, like the labels below and for the same reason: a
    // body can be edited while a --wait is in flight, and an edit that ADDS a
    // closing keyword adds a ticket this merge will close. The set the gate
    // judges has to be the one that is true at the moment of the merge call,
    // not the one that was true when the operator typed the command (#983).
    body: pr.body ?? "",
    prState: pr.state,
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    draft: pr.draft,
    headSha,
    mergeable,
    mergeableState,
    behindBy,
    // Read on every poll like everything else: a push mid-wait changes the
    // branch's commits, and the squash message this gate composes has to be the
    // one belonging to the head it is about to merge (#995).
    commits,
    commitCount: pr.commits ?? null,
    checkRuns: runs,
    linkedIssues,
  };
}

/**
 * Say, immediately before the squash, whether the squash carries everything
 * this branch authored (#550, from #436).
 *
 * #436's loss was three files inside a partially-landed set: a file can be
 * written on a branch, dropped before review, and cease to exist at merge with
 * nothing anywhere recording that it existed. No diff of the PR shows it,
 * because a diff only knows the tip. Only a walk of the branch's own history
 * does — which is what `branch-salvage-sweep.mjs --gate` performs.
 *
 * THIS NEVER REFUSES A MERGE, and that is a decision rather than an oversight.
 * Dropping a file during review is ordinary and often right: the real hit on
 * this repository's history is `nc#312`, whose one-off audit script was removed
 * on purpose and whose commit message says so in as many words. Blocking on
 * that would be a gate people learn to override, and #435 measured what a
 * gate that cries wolf costs. So it prints, loudly, in the last place anyone
 * is looking before the branch stops mattering, and the reader decides.
 *
 * Every failure here is swallowed for the same reason: a missing branch ref, a
 * git that is not there. None of those are facts about the PR, and none of them
 * may stand between a green build and a merge.
 *
 * A SHALLOW CLONE IS NOT ONE OF THEM ANY MORE, AND IS NOT REPAIRED HERE (nc#1205)
 *
 * It used to be one of them. Worker clones are shallow by default, so the check
 * that IS nc#550's durable remedy printed "not checked" and stood aside in
 * exactly the automated merges it was built for — the remedy absent from the
 * path it was meant to guard, as a log line rather than a refusal. That is not
 * a swallowed failure of git; it is a repairable state of the checkout.
 *
 * The repair is `completeCloneIfShallow()`, and it runs ONCE, before `main()`
 * reads its first fact. It is deliberately not attempted from here, and that is
 * review round 2's P1: this function is called between the gate's verdict and
 * the merge call, so a multi-second fetch in this position lets `main` advance
 * while it runs. `mergePullRequest` pins the head SHA and GitHub refuses a
 * moved head, but nothing pins the base — so a retry here could authorise a
 * merge on a `behindBy` that was true six seconds ago. A repair that failed
 * before the loop is reported as an unavailable answer, never retried here.
 *
 * Repair rather than refusal, because the argument above still holds — dropping
 * a file during review is ordinary, this report never blocks, and a blocking
 * version would be overridden into uselessness (nc#435). What changes is that
 * walking past it is no longer free: when the answer cannot be had, the line
 * goes to stderr as a warning naming the guard that did not run, instead of
 * joining the green output as one more line of prose.
 */
export function squashCoverageLine(
  headRef,
  { git, gate = (branch) => gateBranch(branch, git ? { git } : {}), fetch = (ref) => fetchRef(ref, git) } = {},
) {
  if (!headRef) return null;
  try {
    fetch(headRef);
    return formatGate(gate(`origin/${headRef}`));
  } catch (error) {
    return notChecked(error);
  }
}

/** Prefix of the line this check prints when it could not reach an answer. */
export const SQUASH_COVERAGE_NOT_CHECKED = "squash coverage: not checked (nc#550)";

function notChecked(error) {
  return `${SQUASH_COVERAGE_NOT_CHECKED} — ${String(error?.message ?? error).split("\n")[0]}`;
}

/**
 * Is this the refusal that a deeper clone would answer?
 *
 * Matched on the word rather than on an error type because the refusal is
 * raised by `assertDeepClone` in `branch-salvage-sweep.mjs` as a plain Error,
 * and because git's own "shallow" complaints should reach the same repair. A
 * false positive costs one fetch; a false negative costs the guard.
 */
export function isShallowRefusal(error) {
  return /\bshallow\b/i.test(String(error?.message ?? error));
}

/**
 * Squash-merge the pull request over REST, asserting the head (#859).
 *
 * Two things this does that `gh pr merge` did not:
 *
 *   · It speaks REST, so it works in the sessions where merges are actually
 *     run. `gh pr merge` is GraphQL and returns HTTP 403 there — every gate
 *     green, and then nothing.
 *   · It names `sha`. The merge is authorised for ONE commit — the head the
 *     gate just evaluated — so if someone pushed in the sliver between the
 *     last fact-read and this call, GitHub refuses with 409 rather than
 *     squashing code no check-run ever saw. The gate cannot close that window
 *     from here; the server can, and this is how it is asked to.
 *
 * Returns `{ merged: true, sha, message }`, or `{ merged: false, reason }` for
 * a refusal that is a fact about the PR (a moved head, a merge GitHub declined)
 * rather than a broken tool. Anything else throws, because an unrecognised
 * failure must not read as an orderly "did not merge".
 *
 * `api` is injectable for the same reason it is on `readTicket`: the decisions
 * in this file are testable without a network or a transport.
 */
export function mergePullRequest(prNumber, headSha, { squash, api = gh } = {}) {
  if (!headSha) {
    // Never merge "whatever the head is now". The whole point of the argument
    // is that the merge is tied to the commit the gate judged.
    throw new Error("mergePullRequest requires the head SHA the gate evaluated (#859)");
  }
  if (!squash?.title || squash.message == null) {
    /*
     * The same argument as `sha`, one channel over (#995). A merge that does
     * not name its message lets GitHub compose one out of the branch's commits,
     * which is text no gate here has read and which closes issues on its own
     * authority — that is how PR #989's merge closed #922. So the message, like
     * the commit, must be the one the gate evaluated.
     */
    throw new Error("mergePullRequest requires the squash message the gate composed (#995)");
  }

  let raw;
  try {
    raw = api([
      "api",
      "--method",
      "PUT",
      `repos/${REPO}/pulls/${prNumber}/merge`,
      "-f",
      "merge_method=squash",
      "-f",
      `sha=${headSha}`,
      "-f",
      `commit_title=${squash.title}`,
      "-f",
      `commit_message=${squash.message}`,
    ]);
  } catch (error) {
    const text = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? error}`;
    if (/\b409\b|head branch was modified|base branch was modified/i.test(text)) {
      return {
        merged: false,
        stale: true,
        reason:
          `GitHub refused the merge: the head is no longer ${headSha.slice(0, 10)}, which is ` +
          "the commit every gate above was evaluated against. Someone pushed between the " +
          "last check and this call. Nothing was merged — re-run the gate on the new head.",
      };
    }
    if (/\b405\b|not allowed|not mergeable/i.test(text)) {
      return {
        merged: false,
        reason: `GitHub declined the merge of PR #${prNumber}: ${firstLine(text)}`,
      };
    }
    /*
     * Anything else is a broken tool, not a fact about the PR, and it must not
     * read as an orderly "did not merge" — the next move on that reading is to
     * re-run a merge that may already have landed (#571). It is re-thrown
     * carrying `gh`'s own stderr, because this call now captures stdout to
     * parse it and nothing else would ever show the operator why it failed.
     */
    throw new Error(`merge call failed: ${firstLine(text)}`, { cause: error });
  }

  const result = JSON.parse(raw);
  if (result.merged !== true) {
    return {
      merged: false,
      reason:
        `GitHub answered merged=${result.merged} for PR #${prNumber}` +
        `${result.message ? `: ${result.message}` : ""}. Treat this as NOT merged.`,
    };
  }
  return { merged: true, sha: result.sha, message: result.message };
}

function firstLine(text) {
  return (
    String(text)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[0] ?? "no reason given"
  );
}

/**
 * How long any git call this file makes may block (nc#1205, review round 2).
 *
 * `execFileSync` has no timeout by default, so a stalled `origin` transport or
 * a credential helper waiting on nothing holds the gate open indefinitely —
 * before it can print a verdict, a refusal, or even the warning saying the
 * repair failed. Two minutes is an order of magnitude past the slowest of these
 * observed here (the unshallow, about six seconds) and short enough that a
 * wedged fetch is a failure somebody sees rather than a session nobody closes.
 */
const GIT_TIMEOUT_MS = 120_000;

/**
 * `git` in this process's checkout, bounded. Every repair and coverage helper
 * below takes a runner of this shape so a spec can drive the real helpers
 * against a real clone of a real shape rather than against a fake of one — the
 * round-2 `origin/main` fix passed its injected-fake tests and still failed in
 * a real `--single-branch` clone, and round 4's P1 was the same lesson again.
 */
function gitHere(args) {
  return (
    execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: GIT_TIMEOUT_MS,
    }) ?? ""
  );
}

/**
 * Fetch the pull request's branch INTO `origin/<ref>`, which is the ref the
 * coverage walk then asks about. The refspec is explicit for the reason
 * `fetchMainRef` gives: under a `--single-branch` clone of some other branch,
 * a bare `git fetch origin <ref>` writes only `FETCH_HEAD`, so `origin/<ref>`
 * is either missing or stale — and the walk either asked about nothing and got
 * an empty merge-base back as "authors 0" (nc#1205 round 4), or answered about
 * an older head than the one being merged.
 */
function fetchRef(headRef, git = gitHere) {
  git(["fetch", "--quiet", "origin", `+refs/heads/${headRef}:refs/remotes/origin/${headRef}`]);
}

/** Does this checkout have the ref every coverage answer is measured against? */
function hasMainRef(git = gitHere) {
  try {
    git(["rev-parse", "--verify", "--quiet", "origin/main"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bring `origin/main` into a checkout cloned with `--single-branch`.
 *
 * The refspec is explicit because `git fetch origin main` is NOT enough here,
 * which cost this fix its first attempt. A `--single-branch` clone carries a
 * `remote.origin.fetch` restricted to the one branch it was cloned for, so a
 * bare `fetch origin main` downloads the commits and updates `FETCH_HEAD`
 * while writing no remote-tracking ref at all — `origin/main` stays unknown,
 * the repair reports success, and the coverage walk dies exactly as before.
 * Measured in a real `--depth 1 --single-branch` clone, not reasoned about.
 */
function fetchMainRef(git = gitHere) {
  git(["fetch", "--quiet", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
}

/**
 * Complete this checkout's history so the coverage question can be answered
 * (nc#1205).
 *
 * `--unshallow` rather than a bounded `--deepen`, because the question is "is
 * this content anywhere in main's history" and `mainContentIndex` answers it by
 * walking every object main reaches. A bounded deepening would move the
 * boundary without removing it, and a boundary anywhere above the file's own
 * age reads that file as never-landed — the false alarm this check must not
 * produce. Where a repository policy refuses `--unshallow`, the fetch throws
 * and the caller says so in the warning rather than reporting a half-answer.
 */
function deepenClone(git = gitHere) {
  git(["fetch", "--quiet", "--unshallow", "origin"]);
}

/**
 * Do the expensive half of the coverage repair ONCE, before any gate is read
 * (nc#1205, review round 1).
 *
 * `squashCoverageLine` can repair a shallow clone itself, and still does — but
 * it runs immediately before the merge call, and a measured multi-second fetch
 * in that position reopens the window the gate spent #594 and #859 closing:
 * `mergePullRequest` pins the head SHA, so GitHub refuses a moved head, but
 * nothing pins the base, so `main` advancing during the repair would let a
 * pull request merge that the strict up-to-date rule had judged current six
 * seconds earlier.
 *
 * Hoisting it here costs a run that is about to be refused the same six
 * seconds. That is the right way round: the gate needs a complete clone to do
 * its job, and paying for it before the first fact is read is the only position
 * where it cannot invalidate one.
 *
 * Never throws. A clone that cannot be completed is reported and the run
 * continues to its verdict — an unanswerable bookkeeping report has never been
 * allowed to cost a merge, and this does not change that.
 */
export function completeCloneIfShallow({
  git = gitHere,
  hasMain = () => hasMainRef(git),
  fetchMain = () => fetchMainRef(git),
  check = () => assertHistoryComplete(git),
  deepen = () => deepenClone(git),
} = {}) {
  const result = { fetchedMain: false, deepened: false };
  const failed = (error) => ({
    ...result,
    reason: String(error?.message ?? error).split("\n")[0],
  });

  /*
   * `origin/main` first, because the shallowness test is asked ABOUT it
   * (nc#1205, review round 2). `assertDeepClone` looks for a shallow boundary
   * that is an ancestor of `origin/main`, and `merge-base --is-ancestor` on an
   * unresolvable ref simply fails, which that code reads as "not an ancestor".
   * So in a `--depth 1 --single-branch` clone of the pull request's own ref —
   * exactly the checkout this repair exists for — the test RETURNS, the repair
   * is skipped, and the coverage walk then dies on `git rev-list --objects
   * origin/main`. Reproduced in a real clone of that shape rather than reasoned
   * about; and that death does not say "shallow", so nothing downstream would
   * have recognised it either.
   */
  if (!hasMain()) {
    try {
      fetchMain();
      result.fetchedMain = true;
    } catch (error) {
      return failed(error);
    }
  }

  /*
   * Then ask about the WHOLE clone, not about main (nc#1205, review round 4).
   * With `origin/main` fetched whole, a `--depth 1 --single-branch` clone of the
   * feature still has its one boundary on the feature tip; a test asked only
   * about main returned clean, no repair ran, and the coverage walk read the
   * resulting empty merge-base as "authors 0 file(s)". `assertHistoryComplete`
   * refuses on any boundary HEAD or a ref reaches, so that clone is unshallowed
   * here like any other.
   */
  try {
    check();
    return result;
  } catch (error) {
    if (!isShallowRefusal(error)) return result;
    try {
      deepen();
      result.deepened = true;
      return result;
    } catch (deepenError) {
      return failed(deepenError);
    }
  }
}

/**
 * Which stream the coverage line belongs on, and what to say beside it (nc#1205).
 *
 * An ANSWER is output; the ABSENCE of one is a warning. The two used to look
 * identical — one more line of prose in a wall of green, in the last seconds
 * before a squash — which is how nc#550's remedy came to be routinely walked
 * past on the worker clones it was built for. Sending the second to stderr is
 * the whole of the difference: it survives `| tail`, it shows up in a log scan
 * for warnings, and it names the guard that did not run. Pure so the routing is
 * testable; the writing is the four lines below it.
 */
export function squashCoverageReport(line) {
  if (!line) return null;
  if (!line.startsWith(SQUASH_COVERAGE_NOT_CHECKED)) return { stream: "log", lines: [`\n${line}`] };
  return {
    stream: "warn",
    lines: [
      `\n${line}`,
      "This merge is proceeding WITHOUT nc#550's check that the squash carries every " +
        "file this branch authored. That guard exists because three files were lost " +
        "exactly this way and sat unnoticed for fifteen days (nc#436). Read the branch " +
        "before you rely on the squash.",
    ],
  };
}

function reportSquashCoverage(headRef) {
  const report = squashCoverageReport(squashCoverageLine(headRef));
  if (!report) return;
  const write = report.stream === "warn" ? console.warn : console.log;
  for (const line of report.lines) write(line);
}

function main(argv) {
  const { prNumber, override, cleared, wait, dryRun, usageError, unknown } = parseArgs(argv);
  if (usageError) {
    if (unknown?.length) {
      console.error(
        `\nmerge-pr: REFUSED — unrecognised argument${unknown.length > 1 ? "s" : ""}: ` +
          unknown.join(", "),
      );
      console.error(
        "Nothing was merged. A flag this script does not know is a typo or a wrong mental " +
          "model of it, and neither may quietly become a merge (#1242).",
      );
    }
    console.error(USAGE);
    process.exit(2);
  }
  if (override === "") fail("--admin-override requires a written reason");
  if (cleared === "") {
    fail(
      "--johan-cleared requires a written reason naming the ticket, e.g. " +
        '--johan-cleared "#703 — Johan answered in <link>"',
    );
  }
  const clearedTickets = ticketRefs(cleared);
  if (cleared && clearedTickets.length === 0) {
    fail(
      "--johan-cleared must NAME the gated ticket it clears, as `#703`. A reason that " +
        "names no ticket clears nothing, because the whole point of the flag is that the " +
        "shell history and the merge report say WHICH question Johan answered (#823).",
    );
  }

  /*
   * Complete a shallow clone HERE, before the first fact is read (nc#1205,
   * review round 1). See the note beside `reportSquashCoverage` below for why
   * the position is the point rather than an ordering preference.
   */
  const repair = completeCloneIfShallow();
  if (repair.reason) {
    console.log(`could not complete this clone's history: ${repair.reason}`);
  } else if (repair.fetchedMain || repair.deepened) {
    console.log(
      `completed this clone's history so the squash-coverage check (nc#550) can answer` +
        `${repair.fetchedMain ? " (fetched origin/main)" : ""}` +
        `${repair.deepened ? " (unshallowed)" : ""}.`,
    );
  }

  const startedAt = Date.now();
  const deadline = startedAt + WAIT_TIMEOUT_MS;

  // The notes an evaluation produces are an append-only prefix, so a counter is
  // enough to print each line exactly once across polls.
  let printedNotes = 0;
  let printedWarnings = 0;
  let lastHeadSha = null;

  for (;;) {
    const facts = collectFacts(prNumber);

    if (lastHeadSha && facts.headSha !== lastHeadSha) {
      // Someone pushed while we waited. The green build we were watching
      // belongs to a commit that is no longer the head, so it is not evidence
      // about this one: start the head's story over.
      console.log(
        `\nhead moved ${lastHeadSha.slice(0, 10)} -> ${facts.headSha.slice(0, 10)}; ` +
          "re-checking every gate against the new head.",
      );
      printedNotes = 0;
      printedWarnings = 0;
    }
    lastHeadSha = facts.headSha;

    const result = evaluateGates({
      ...facts,
      clearedTickets,
      override: Boolean(override),
      wait,
      waitExpired: wait && Date.now() >= deadline,
      waitBudgetMs: WAIT_TIMEOUT_MS,
    });

    for (const note of result.notes.slice(printedNotes)) console.log(note);
    printedNotes = result.notes.length;
    for (const warning of result.warnings.slice(printedWarnings)) console.warn(warning);
    printedWarnings = result.warnings.length;

    if (result.verdict === "refuse") fail(result.reason);

    if (result.verdict === "wait") {
      const elapsed = Date.now() - startedAt;
      console.log(
        `waiting ${formatDuration(elapsed)}/${formatDuration(WAIT_TIMEOUT_MS)} — ` +
          `${result.waitingFor}; re-checking in ${Math.round(POLL_INTERVAL_MS / 1000)}s`,
      );
      sleepSync(Math.max(0, Math.min(POLL_INTERVAL_MS, deadline - Date.now() + 1)));
      continue;
    }

    if (override) {
      console.warn(`\nADMIN OVERRIDE IN USE: ${override}`);
      console.warn(
        "This bypassed the strict up-to-date requirement only; check requirements were still enforced.\n",
      );
    }

    if (cleared) {
      console.warn(`\nJOHAN GATE CLEARED IN USE: ${cleared}`);
      console.warn(
        `This bypassed the content gate on ${clearedTickets.map((n) => `#${n}`).join(", ")} ` +
          "only (#823); every check requirement was still enforced. The answer it claims " +
          "is Johan's, and this line is the record that it was claimed.\n",
      );
    }

    /*
     * Merge off THIS evaluation, which is seconds old, not off one taken
     * before a sleep. A sub-second window between the last API read and the
     * merge call remains and is irreducible from here; what --wait must never
     * do is widen it back out to the length of a build.
     *
     * Which is why completing a shallow clone happens ABOVE, before the first
     * fact is read, and not here (nc#1205, review round 1). The repair is a
     * measured multi-second fetch, and running it in this position would put
     * six seconds between the `behindBy` this gate just judged and the merge
     * call — `mergePullRequest` pins the HEAD, so a moved head is refused by
     * the server, but nothing pins the BASE, so `main` advancing inside that
     * window would merge a pull request the strict up-to-date rule had already
     * passed on stale evidence. What is left here is the same `git fetch
     * origin <ref>` and object walk this report has always done — measured at
     * 773ms on a complete clone of this repository, which is the sub-second
     * window the paragraph above calls irreducible rather than a new one.
     */
    reportSquashCoverage(facts.headRef);

    if (dryRun) {
      // The verdict, and nothing else: this is how you read the gate's
      // reasoning without spending the merge (#1242). Everything above has
      // already printed — the notes, the warnings, the coverage report — so
      // what a dry run costs is the API reads and what it buys is the answer.
      console.log(
        `\nWOULD MERGE (--dry-run): all gates green at head ${facts.headSha.slice(0, 10)}. ` +
          "Nothing was merged.",
      );
      console.log(`squash title: ${result.squash.title}`);
      return 0;
    }

    console.log(`\nAll gates green. Squash-merging at head ${facts.headSha.slice(0, 10)}...`);
    console.log(`squash title: ${result.squash.title}`);
    const merge = mergePullRequest(prNumber, facts.headSha, { squash: result.squash });
    if (!merge.merged) fail(merge.reason);
    console.log(
      `merged PR #${prNumber} at head ${facts.headSha.slice(0, 10)} — ` +
        `squash ${String(merge.sha ?? "").slice(0, 10)}: ${merge.message ?? "merged"}`,
    );
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
