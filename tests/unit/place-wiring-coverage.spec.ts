import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The coverage guard: every surface that loads a session resolves it for the
 * place, or is exempt for a written reason.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS A SOURCE SCAN ───────────────────────────
 *
 * The first pass of this wiring covered three surfaces out of eight. /read
 * showed a Phoenix teacher "look under rocks" while /run — the page she is
 * actually holding while standing outside with the class — still said "look
 * under logs". Half-wired is worse than unwired: unwired is one known bug,
 * half-wired is the product contradicting itself between the page a teacher
 * prepares from and the page she leads from.
 *
 * Nothing caught that, because every behavioural test passed. The resolver was
 * correct, the seam was correct, and the surfaces simply did not call them. So
 * the guard has to be about REACH rather than about behaviour, and reach is a
 * property of the source.
 *
 * ── WHY IT MATTERS RIGHT NOW ───────────────────────────────────────────────
 *
 * #242 (#231, #232) is rewriting /session and /run in a parallel session. T2
 * explicitly collapses /session plus its sub-routes into one scrollable page,
 * which means at least one file in the list below will be deleted and rebuilt
 * by someone who has never heard of this seam.
 *
 * When that happens this test goes red and names the file. That is the whole
 * point: the seam is protected by a mechanism rather than by a note in a PR
 * comment that nobody reads six weeks later. A new lesson surface added on a
 * Friday gets caught the same way.
 */

const APP_DIR = join(process.cwd(), "app");

/** Loading a session by any of these means a surface is holding pack prose. */
const LOADS_A_SESSION = /\b(findSession|leadPack|shelfPacks)\s*\(/;

/** Resolving it for the place. Any of the three entry points counts. */
const RESOLVES_FOR_PLACE =
  /\b(sessionForPlace|shelfForPlace|resolveSessionForPlace|adaptSessionForPlace)\s*\(/;

/**
 * Surfaces that legitimately load a session and do NOT need resolution, each
 * with the reason it does not. A file earns a place here by not rendering any
 * habitat-bearing field, not by being inconvenient to wire.
 */
const EXEMPT: Record<string, string> = {
  "session/start/page.tsx":
    "The starting-place chooser renders only the session title and navigation links. It renders no lesson blocks, habitat instructions or spaceNeeded; both links lead to /run, which resolves the lesson for the place.",
  "species/[slug]/page.tsx":
    "The profile calls findSession only to check that the run named on its way-back link exists (#874). It renders nothing from the session: no block text, no spaceNeeded, no instruction. The link target, /run, resolves the session for the place itself.",
  "today/page.tsx":
    "Today renders the session's title, driving question and minutes only. No block text, no spaceNeeded, so there is nothing place-dependent to resolve.",
  "api/world-memory/retire/route.ts":
    "The memory strip's retire (#509) calls findSession for ONE reason: to refuse a session id that is not a real lesson before putting it in the redirect it builds. It renders nothing at all — it writes a class column and answers 303 — so there is no prose here to resolve for a place. If this handler ever renders a word of a lesson, this exemption is wrong and goes with it.",
  "api/conditions/route.ts":
    "Grounds the conditions line on topic, objective and topicTags. Carries no habitat-bearing prose.",
  "cast/page.tsx":
    "The speak-and-show shell renders the surface's own heading and a way back to /run, and nothing off the session but its id (nc#845). Every habitat-bearing word on this route is rendered by cast/CastBoard.tsx, which is NOT exempt: it is named in DOWNSTREAM below and asserted to resolve, because an exemption whose reason points at another file is worth nothing unless that other file is checked. If a lesson block, spaceNeeded or any instruction ever lands in the shell, this exemption is wrong and goes with it.",
  "outside/page.tsx":
    "The brief reads the session's topicTags ONLY, to rank the cast toward today's lesson (#161). It renders no block text, no spaceNeeded and no instruction of any kind: every word on the page is either the teacher's own conditions readout or a species name and note that came from Pointmoon and the phenology, both of which are already resolved for this place upstream.",
};

/**
 * Surfaces that RENDER a session without LOADING one, because a route file
 * hands it down as a prop. The scan above cannot see them — it finds
 * candidates by `findSession|leadPack|shelfPacks`, and a component that takes
 * `session` as a prop calls none of those — so a route that splits into a
 * shell and a board would otherwise walk straight out of this guard, taking
 * its exemption with it and leaving the route checked by nothing at all
 * (nc#845). Named here, they are held to exactly the same bar.
 *
 * This list is hand-maintained, like EXEMPT above and for the same reason: the
 * question "does this file render habitat-bearing prose" is not one a regex
 * can answer. What it buys is that splitting a wired surface in two is a
 * deliberate act with a place to record it, rather than a silent way out.
 */
const DOWNSTREAM: Record<string, string> = {
  "cast/CastBoard.tsx":
    "The speak-and-show board. It takes the session as a prop from cast/page.tsx, renders the lesson's cast and the empty-morning sentence, and is where every habitat-bearing word on /cast comes from.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("every session surface resolves for the place", () => {
  const files = walk(APP_DIR).map((path) => ({
    rel: path.slice(APP_DIR.length + 1),
    source: readFileSync(path, "utf8"),
  }));

  const loaders = files.filter((file) => LOADS_A_SESSION.test(file.source));

  it("finds the session surfaces at all, so the scan cannot pass vacuously", () => {
    // If a refactor renames the loaders, this guard would otherwise go green by
    // finding nothing to check. That failure mode is the reason for this test.
    expect(loaders.length).toBeGreaterThanOrEqual(6);
  });

  it("wires every surface that loads a session, or exempts it with a reason", () => {
    const unwired = loaders
      .filter((file) => !RESOLVES_FOR_PLACE.test(file.source))
      .filter((file) => !(file.rel in EXEMPT))
      .map((file) => file.rel);

    // A named file here means a teacher can read one instruction on one screen
    // and a different one on the next. Wire it, or add it to EXEMPT with the
    // reason it carries no habitat-bearing prose.
    expect(unwired).toEqual([]);
  });

  it("keeps every exemption pointed at a file that still exists", () => {
    // An exemption for a deleted file is a hole that reopens silently the day
    // someone recreates the path.
    const present = new Set(files.map((file) => file.rel));
    const stale = Object.keys(EXEMPT).filter((rel) => !present.has(rel));
    expect(stale).toEqual([]);
  });

  it("gives every exemption a real reason, not a placeholder", () => {
    for (const [rel, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, rel).toBeGreaterThan(40);
    }
  });

  it("holds every downstream surface to the same bar, reason and all", () => {
    // A file named here is one the loader scan cannot reach. If it stops
    // resolving, /cast goes back to showing a Phoenix teacher an instruction
    // written for somewhere else, and nothing above this line would notice.
    const unwired = Object.keys(DOWNSTREAM).filter((rel) => {
      const file = files.find((candidate) => candidate.rel === rel);
      return !file || !RESOLVES_FOR_PLACE.test(file.source);
    });
    expect(unwired).toEqual([]);

    for (const [rel, reason] of Object.entries(DOWNSTREAM)) {
      expect(reason.length, rel).toBeGreaterThan(40);
    }
  });

  it("keeps a downstream entry pointed at a file that still exists", () => {
    const present = new Set(files.map((file) => file.rel));
    expect(Object.keys(DOWNSTREAM).filter((rel) => !present.has(rel))).toEqual([]);
  });
});

/**
 * THE SECOND HALF OF THE SAME SEAM: WHAT SHE TOLD US ABOUT HER OWN GROUNDS.
 *
 * The scan above proves a surface resolves the session for its PLACE. This one
 * proves it also asks for the right WEEK — the species and look-fors narrowed
 * to the habitats this class can actually reach.
 *
 * It is the same failure, one layer down, and it was live. `getOutsideNow`
 * has taken a `habitats` argument all along, and the two lesson surfaces never
 * passed it. So a teacher ticked her grounds at onboarding, added her pond and
 * her wild corner, and every one of those answers reached the cast and stopped
 * there. The lesson she led was composed from the whole region's week,
 * identical to a school on bare tarmac two streets away.
 *
 * Behaviour tests could not see it, for exactly the reason written at the top
 * of this file: every function was correct and the callers simply did not pass
 * the argument. Reach is a property of the source, so it is checked here.
 */

/** Asking the nature layer what is around, for a real class. */
const ASKS_OUTSIDE = /\bgetOutsideNow\s*\(/;
/**
 * Narrowing that question to the habitats this class can reach.
 *
 * Matches both `habitats: reachable` and the shorthand `habitats,` — the
 * onboarding preview route already used the shorthand form, and a guard that
 * only understood one of the two spellings would have named a correctly wired
 * file and taught the next person to silence it with an exemption.
 */
const PASSES_HABITATS = /\bhabitats\s*[,:}]/;

/**
 * Callers that ask `getOutsideNow` and legitimately do NOT narrow by habitat,
 * each with the reason. A file earns a place here by not speaking for one
 * class's grounds, not by being inconvenient to wire.
 */
const HABITAT_EXEMPT: Record<string, string> = {
  "api/lesson-support/route.ts":
    "Builds the closed fact block for an optional teacher-support draft, whose grounding is the authored lesson plus a five-kilometre presence receipt. It speaks about the lesson rather than about the school's own grounds.",
};

/**
 * Every `getOutsideNow(...)` argument list in a source file, one string each.
 *
 * PER CALL SITE, not per file, and that distinction is the whole guard. The
 * first draft of this test scanned whole files, so `app/run/page.tsx` — which
 * asks the nature layer once and the grounding layer once — stayed green when
 * one of its two calls lost `habitats`. A file-level scan reports the file's
 * best call, and half-wired is the exact failure this file was written for.
 */
function outsideCallArgs(source: string): string[] {
  const calls: string[] = [];
  const needle = "getOutsideNow(";
  let from = 0;
  for (;;) {
    const start = source.indexOf(needle, from);
    if (start === -1) return calls;
    let depth = 0;
    let i = start + needle.length - 1;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push(source.slice(start, i + 1));
    from = i + 1;
  }
}

describe("every lesson surface asks about the grounds she told us about", () => {
  const files = walk(APP_DIR).map((path) => ({
    rel: path.slice(APP_DIR.length + 1),
    source: readFileSync(path, "utf8"),
  }));

  const askers = files.filter((file) => ASKS_OUTSIDE.test(file.source));

  it("finds the callers at all, so the scan cannot pass vacuously", () => {
    // Renaming `getOutsideNow` would otherwise turn this guard green by
    // finding nothing to check, which is the failure mode it exists to avoid.
    expect(askers.length).toBeGreaterThanOrEqual(3);
  });

  it("finds each call site, not just each file", () => {
    // The per-call-site scan is the guard. If the extractor ever returns
    // nothing, the test below would pass by checking an empty list.
    const sites = askers.flatMap((file) => outsideCallArgs(file.source));
    expect(sites.length).toBeGreaterThanOrEqual(askers.length);
  });

  it("narrows by habitat at every call site, or exempts the file with a reason", () => {
    const unnarrowed = askers
      .filter((file) => !(file.rel in HABITAT_EXEMPT))
      .filter((file) =>
        outsideCallArgs(file.source).some((call) => !PASSES_HABITATS.test(call))
      )
      .map((file) => file.rel);

    // A named file here means a teacher's own pond, wild corner and hedgerow
    // reach the cast and nothing else, and her lesson is the region's.
    expect(unnarrowed).toEqual([]);
  });

  it("keeps every habitat exemption pointed at a file that still exists", () => {
    const present = new Set(files.map((file) => file.rel));
    const stale = Object.keys(HABITAT_EXEMPT).filter((rel) => !present.has(rel));
    expect(stale).toEqual([]);
  });

  it("gives every habitat exemption a real reason, not a placeholder", () => {
    for (const [rel, reason] of Object.entries(HABITAT_EXEMPT)) {
      expect(reason.length, rel).toBeGreaterThan(40);
    }
  });
});
