import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadPack } from "@/lib/pack";
import { collectSpokenLines } from "@/lib/lesson/spoken-audio";
import { projectCoreSessionV1 } from "@/lib/offline/core-session";
import { affectedOutputUses, buildOtherOutputManifest, coreSessionDependencies, spokenOutputUses } from "@/lib/content/other-output-dependencies";
import { changedDependencies } from "@/lib/content/dependencies";
const shared = {settle: JSON.parse(readFileSync("packs/settle.json", "utf8"))};
const lesson = () => loadPack("autumn-starter").sessions.find(s => s.id === "animal-leaf-masks")!;
describe("spoken and offline artifact dependencies", () => {
 it("reports artifact availability separately from content changes", () => {
  const before=buildOtherOutputManifest();const after=structuredClone(before);
  after.outputs[0]!.recordedArtifact="/fixture-new-recording.mp3";
  const changes=affectedOutputUses(before,after);
  expect(changes).toHaveLength(1);expect(changes[0]!.availabilityChanged).toBe(true);expect(changes[0]!.keyChanged).toBe(false);
  expect(before.outputs.find(o=>o.kind==="offline-core")!.sources.some(d=>d.source.scope==="shared" && d.source.field==="sessions.$order")).toBe(true);
 });
 it("matches the connected build sidecar", () => {
  expect(JSON.parse(readFileSync("lib/lesson/output-dependencies.json", "utf8"))).toEqual(buildOtherOutputManifest());
 });
 it("keeps the spoken corpus unchanged and retargets only the edited source use", () => {
  const source=lesson();const before=spokenOutputUses(source,shared,true);
  expect([...new Set(before.map(use=>use.key))]).toEqual(collectSpokenLines(source));
  const changed=structuredClone(source);
  const block=changed.phases.flatMap(p=>p.blocks).find(b=>b.nid && b.type==="say-aloud")!;
  if(block.type!=="say-aloud")throw Error("fixture");
  block.text+=" Changed spoken line.";
  const after=spokenOutputUses(changed,shared,true);
  const affected=affectedOutputUses({version:1,outputs:before},{version:1,outputs:after});
  expect(affected).toHaveLength(1);
  expect(affected[0]!.changes[0]!.source).toMatchObject({scope:"node",nid:block.nid,field:"text"});
  expect(affected[0]!.keyChanged).toBe(true);
 });
 it("records every projected core node without leaking author notes into its dependency set", () => {
  const source=lesson();const before=coreSessionDependencies(source,true);
  const changed=structuredClone(source);changed.authorNotes="Author-only revision";
  for(const phase of changed.phases)phase.authorNotes="Not public teaching content";
  expect(projectCoreSessionV1(changed)).toEqual(projectCoreSessionV1(source));
  expect(changedDependencies(before,coreSessionDependencies(changed,true))).toEqual([]);
  expect(before.some(d=>d.source.scope==="node")).toBe(true);
  expect(before.some(d=>d.source.scope==="shared" && d.source.sourceId==="settle")).toBe(true);
  expect(before.some(d=>d.source.field.includes("authorNotes"))).toBe(false);
 });
});
