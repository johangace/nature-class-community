import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadPack } from "@/lib/pack";
import { clipKey } from "@/lib/lesson/preview-audio";
import { changedDependencies, sourceAddress } from "@/lib/content/dependencies";
import { traceWorksheet } from "@/lib/content/worksheet-dependencies";
import { previewDependencies } from "@/lib/content/preview-dependencies";
import { affectedOutputUses, coreSessionDependencies, spokenOutputUses } from "@/lib/content/other-output-dependencies";
import type { Session } from "@/schema/pack";

/**
 * #1087's readiness criterion, across the kinds at once: editing ONE node marks
 * only its dependents stale, and every unaffected artifact key is unchanged.
 *
 * One direction of that was already covered — a worksheet ignores an unrelated
 * say-aloud line (worksheet-dependencies). The rest was not. Nothing asserted
 * the opposite direction, that a worksheet-node edit leaves the spoken clips
 * and the preview narration alone, and nothing held the public core projection
 * against a single node edit at all. Those are where a dependency set can
 * quietly widen to the whole session with every per-kind spec still green.
 */

const raw = JSON.parse(readFileSync("packs/autumn-starter.json", "utf8"));
const pack = {id: raw.id, title: raw.title, sessionIds: raw.sessions.map((s: {id: string}) => s.id)};
const shared = {settle: JSON.parse(readFileSync("packs/settle.json", "utf8"))};
const lesson = () => loadPack("autumn-starter").sessions.find(s => s.id === "animal-leaf-masks")!;
const ABILITIES = [undefined, "reception", "y1", "y2"] as const;

/** Every derived output this session has, keyed the way each kind keys it. */
function outputs(session: Session) {
  const settled = session.settle === true;
  const preview = previewDependencies(session, shared, settled);
  return {
    spoken: spokenOutputUses(session, shared, settled),
    worksheets: ABILITIES.map(ability => traceWorksheet(session, ability, pack)),
    core: coreSessionDependencies(session, settled),
    previewCards: preview.cards,
    previewSources: preview.sources,
  };
}

/** The addresses of the core fields whose recorded value moved. */
const movedCoreFields = (before: ReturnType<typeof outputs>, after: ReturnType<typeof outputs>) =>
  changedDependencies(before.core, after.core).map(change => sourceAddress(change.source));

const staleCards = (before: ReturnType<typeof outputs>, after: ReturnType<typeof outputs>) =>
  [...before.previewSources]
    .filter(([card, refs]) => changedDependencies(refs, after.previewSources.get(card) ?? []).length)
    .map(([card]) => card);

describe("one node edit, every output kind", () => {
  it("moves the worksheet and its own core field, and nothing spoken or narrated", () => {
    const source = lesson();
    const before = outputs(source);

    const changed = structuredClone(source);
    const title = changed.childSheet.find(block => block.type === "sheet-title")!;
    if (title.type !== "sheet-title") throw Error("fixture");
    title.title = "A different worksheet title";
    const after = outputs(changed);

    // Its dependents: the rendered sheets, and exactly one public core field.
    // Every ability, one at a time: an aggregate inequality would pass while
    // three of the four still carried stale html.
    expect(after.worksheets.map((sheet, index) => sheet.html !== before.worksheets[index]!.html))
      .toEqual(ABILITIES.map(() => true));
    expect(movedCoreFields(before, after)).toEqual([
      sourceAddress({scope: "node", sessionId: source.id, nid: title.nid!, field: "title"}),
    ]);

    // Everything else: unchanged keys, not merely an unchanged dependency set.
    expect(after.spoken.map(use => use.key)).toEqual(before.spoken.map(use => use.key));
    expect(affectedOutputUses({version: 1, outputs: before.spoken}, {version: 1, outputs: after.spoken})).toEqual([]);
    expect(staleCards(before, after)).toEqual([]);
    for (const card of before.previewCards) {
      expect(clipKey(after.previewCards.find(c => c.id === card.id)!.narration)).toBe(clipKey(card.narration));
    }
  });

  it("moves one spoken clip and its own core field, and no worksheet", () => {
    const source = lesson();
    const before = outputs(source);

    const changed = structuredClone(source);
    const spoken = changed.phases.flatMap(phase => phase.blocks).find(block => block.nid && block.type === "say-aloud")!;
    if (spoken.type !== "say-aloud") throw Error("fixture");
    spoken.text += " Changed spoken line.";
    const after = outputs(changed);

    const affected = affectedOutputUses({version: 1, outputs: before.spoken}, {version: 1, outputs: after.spoken});
    expect(affected).toHaveLength(1);
    expect(affected[0]!.keyChanged).toBe(true);
    expect(affected[0]!.changes[0]!.source).toMatchObject({scope: "node", nid: spoken.nid, field: "text"});
    expect(movedCoreFields(before, after)).toEqual([
      sourceAddress({scope: "node", sessionId: source.id, nid: spoken.nid!, field: "text"}),
    ]);

    // A say-aloud line is not worksheet input, at any ability.
    expect(after.worksheets.map(w => w.html)).toEqual(before.worksheets.map(w => w.html));
    for (const [index, sheet] of after.worksheets.entries()) {
      expect(changedDependencies(before.worksheets[index]!.sources, sheet.sources)).toEqual([]);
    }

    // Nor is it narration: `previewDeck` reads teacher-notes and says in its
    // own header that say-aloud is deliberately never narrated. Asserted here
    // rather than left to that comment, and in both directions with the case
    // above, so neither kind can start reading the other unnoticed.
    expect(staleCards(before, after)).toEqual([]);
    for (const card of before.previewCards) {
      expect(clipKey(after.previewCards.find(c => c.id === card.id)!.narration)).toBe(clipKey(card.narration));
    }
  });
});
