import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadPack } from "@/lib/pack";
import { previewDeck } from "@/lib/lesson/preview";
import { clipKey } from "@/lib/lesson/preview-audio";
import { previewDependencies } from "@/lib/content/preview-dependencies";
import { changedDependencies } from "@/lib/content/dependencies";
import { buildDependencyManifest, affectedNarration } from "../../scripts/build-preview-narration.mjs";

const lesson = () => loadPack("autumn-starter").sessions.find(s => s.id === "animal-leaf-masks")!;
describe("preview builder dependency recording", () => {
 it("reports new outputs and changed recording keys even when source dependencies are identical", () => {
  const original = buildDependencyManifest();
  const current = structuredClone(original);
  current.outputs[0]!.expectedClipKey = "new-voice-or-rendering";
  current.outputs.push({...current.outputs[1]!, key: "new-lesson/new-card"});
  const affected = affectedNarration(original, current);
  expect(affected.find(a => a.key === original.outputs[0]!.key)?.reason).toBe("recording-changed");
  expect(affected.find(a => a.key === "new-lesson/new-card")?.reason).toBe("output-added");
 });
 it("commits the sidecar produced by the real builder", () => {
  expect(JSON.parse(readFileSync("lib/lesson/preview-dependencies.json", "utf8"))).toEqual(buildDependencyManifest());
 });
 it("records a teacher-note edit against its narration only and keeps other clip keys", () => {
  const source = lesson(); const before = previewDependencies(source);
  expect(before.cards).toEqual(previewDeck(source));
  const changed = structuredClone(source);
  const phaseIndex = changed.phases.findIndex(p => p.nid && p.blocks.some(b => b.type === "teacher-note"));
  const block = changed.phases[phaseIndex]!.blocks.find(b => b.type === "teacher-note")!;
  if (block.type !== "teacher-note") throw Error("fixture");
  block.text = "Changed first teacher instruction. " + block.text;
  const after = previewDependencies(changed);
  const stale = [...before.sources].filter(([card, refs]) => changedDependencies(refs, after.sources.get(card) ?? []).length).map(([card]) => card);
  expect(stale).toEqual([`phase-${phaseIndex}`]);
  for (const card of before.cards.filter(c => c.id !== stale[0])) {
    expect(clipKey(after.cards.find(c => c.id === card.id)!.narration)).toBe(clipKey(card.narration));
  }
 });
 it("tracks a shared settling edit under its own document rather than a lesson node", () => {
  const source = loadPack("autumn-garden").sessions.find(s => s.settle)!;
  expect(source).toBeDefined();
  const shared = {settle: JSON.parse(readFileSync("packs/settle.json", "utf8"))};
  const before = previewDependencies(source, shared, true);
  const refs = before.sources.get("phase-0")!;
  expect(refs.some(d => d.source.scope === "shared" && d.source.sourceId === "settle")).toBe(true);
  const next = structuredClone(shared); next.settle.phase.title += " revised";
  const after = previewDependencies(source, next, true);
  expect(changedDependencies(refs, after.sources.get("phase-0")!).some(d => d.source.scope === "shared")).toBe(true);
 });
 it("records absent optional inputs and does not require revoicing a visual-only kit edit", () => {
  const source = lesson(); delete source.primer;
  const before = previewDependencies(source);
  expect(before.sources.has("idea")).toBe(true);
  const copy = structuredClone(source); copy.kit = [...(copy.kit ?? [])]; copy.kit[0] = "Changed kit wording";
  const after = previewDependencies(copy);
  expect(clipKey(before.cards.find(c => c.id === "kit")!.narration)).toBe(clipKey(after.cards.find(c => c.id === "kit")!.narration));
 });
});
