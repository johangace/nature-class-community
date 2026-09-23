import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalSessionId,
  findSession,
  loadAllPacks,
  RETIRED_SESSION_IDS,
} from "@/lib/pack";
import { sessionMinutes } from "@/lib/teacher";

/**
 * RETIRED SESSION IDS STAY RESOLVABLE (#468).
 *
 * A session id leaves the building three ways a rename can break: a link a
 * teacher saved, a `session_completion` row already written, and a completion
 * queued offline on an iPad that has not reloaded since. `RETIRED_SESSION_IDS`
 * is what keeps all three working, and this file is what stops the map from
 * quietly rotting — an entry whose target no longer exists, or an id renamed
 * with no entry made at all, fails here rather than in a classroom.
 *
 * The CALL SITES that use the map are pinned next door:
 * `retired-session-id-boundaries.spec.ts` (the completions route, the
 * /session → /run rewrite, `completedSessionIds()`) and
 * `retired-session-id-journal.spec.ts` (the journal's entries and its "still
 * to lead" list). This file is the map; those are the paths a teacher's data
 * actually travels.
 *
 * The first entry is `a5-leaf-collage`. The autumn starter's opening lesson
 * kept that id from an earlier title while rendering as "Leaves and their
 * trees", so the id named one lesson and opened another, and read as the
 * genuinely different `summer-w3-a5-leaf-collage` ("A5 leaf collage"). It cost
 * a wrong bug report before it was renamed.
 */
describe("retired session ids", () => {
  it("has at least one retired id, and every target is a real session", () => {
    const entries = Object.entries(RETIRED_SESSION_IDS);
    expect(entries.length).toBeGreaterThan(0);
    const live = new Set(
      loadAllPacks().flatMap((pack) => pack.sessions.map((s) => s.id))
    );
    for (const [retired, current] of entries) {
      expect(live.has(current), `${retired} -> ${current} should exist`).toBe(true);
      expect(live.has(retired), `${retired} should no longer be a live id`).toBe(false);
    }
  });

  it("resolves a retired id to the session it became", () => {
    for (const [retired, current] of Object.entries(RETIRED_SESSION_IDS)) {
      expect(canonicalSessionId(retired)).toBe(current);
      expect(findSession(retired)?.session.id).toBe(current);
    }
  });

  it("leaves an id that was never retired alone", () => {
    expect(canonicalSessionId("bark-rubbings")).toBe("bark-rubbings");
    expect(canonicalSessionId("summer-w3-a5-leaf-collage")).toBe(
      "summer-w3-a5-leaf-collage"
    );
    expect(findSession("summer-w3-a5-leaf-collage")?.session.title).toBe(
      "A5 leaf collage"
    );
  });

  it("answers with a planned length for a retired id, so old minutes stay capped", () => {
    const minutes = sessionMinutes();
    for (const [retired, current] of Object.entries(RETIRED_SESSION_IDS)) {
      expect(minutes.get(retired)).toBe(minutes.get(current));
      expect(minutes.get(retired)).toBeGreaterThan(0);
    }
  });

  /**
   * THE RENAME GUARD (#543), in the test runner.
   *
   * `scripts/lib/session-ids.snapshot.json` is the committed list of every
   * live session id, and `npm run validate:packs` diffs the catalogue against
   * it — an id that has left with no `RETIRED_SESSION_IDS` entry fails there,
   * naming the entry that is missing. `npm run packs:snapshot` runs the same
   * diff before it writes and refuses the same departure (nc#670), so the
   * verdict no longer depends on which command you type first. This assertion
   * is the same guard's half of `npm test`, so a rename cannot reach a review
   * green just because nobody ran the script.
   *
   * Before the snapshot existed, a rename with no map entry failed nothing
   * that said so. It failed in whichever unrelated specs happened to hardcode
   * the id, reading like "these tests need their ids updated" — and that is
   * how the entry gets dropped instead of added.
   */
  it("keeps the committed snapshot of live session ids in step", () => {
    const snapshot = JSON.parse(
      readFileSync(
        new URL("../../scripts/lib/session-ids.snapshot.json", import.meta.url),
        "utf8"
      )
    ) as { sessionIds: string[] };
    const live = loadAllPacks()
      .flatMap((pack) => pack.sessions.map((s) => s.id))
      .sort();

    expect(
      snapshot.sessionIds,
      "scripts/lib/session-ids.snapshot.json no longer matches the catalogue. " +
        "If an id LEFT the list, a session was renamed: add its entry to " +
        "RETIRED_SESSION_IDS in lib/pack.ts first (either npm run validate:packs " +
        "or npm run packs:snapshot names the entry it wants), then refresh the " +
        "snapshot with `npm run packs:snapshot`. " +
        "Only the snapshot is regenerated — never resolve this by editing session " +
        "ids in tests."
    ).toEqual(live);
  });

  it("the autumn starter opens on an id that says what it opens", () => {
    const found = findSession("leaves-and-their-trees");
    expect(found?.pack.id).toBe("autumn-starter");
    expect(found?.session.title).toBe("Leaves and their trees");
    expect(findSession("a5-leaf-collage")?.session.id).toBe("leaves-and-their-trees");
  });
});
