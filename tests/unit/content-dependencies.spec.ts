import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sessionSchema } from "@/schema/pack";
import { changedDependencies, sessionDependencies, sourceAddress } from "@/lib/content/dependencies";

const source = () => sessionSchema.parse(JSON.parse(readFileSync("packs/autumn-starter.json", "utf8")).sessions.find((s: {id:string}) => s.id === "animal-leaf-masks"));
describe("exact source dependencies", () => {
 it("finds an old dependent after an unrelated intermediate revision", () => {
  const original = source();
  const title = sessionDependencies(original).filter(d => d.source.scope === "session" && d.source.field === "title");
  expect(title).toHaveLength(1);
  const later = structuredClone(original); later.prompt += " unrelated edit";
  expect(changedDependencies(title, sessionDependencies(later))).toEqual([]);
  later.title += " corrected title";
  const changes = changedDependencies(title, sessionDependencies(later));
  expect(changes).toHaveLength(1); expect(changes[0]!.reason).toBe("source-field-changed");
 });
 it("separates two fields on one node and preserves their addresses across reordering", () => {
  const original = source(); const phase = original.phases[0]!;
  const dependency = sessionDependencies(original).filter(d => d.source.scope === "node" && d.source.nid === phase.nid && d.source.field === "title");
  const later = structuredClone(original); later.phases[0]!.durationMin! += 1; later.phases.reverse();
  expect(changedDependencies(dependency, sessionDependencies(later))).toEqual([]);
  expect(sourceAddress(dependency[0]!.source)).toContain(phase.nid!);
 });
 it("records deleted fields explicitly and detects inserted/reordered activities", () => {
  const original = source(); const dependencies = sessionDependencies(original);
  const later = structuredClone(original); later.phases.pop();
  expect(changedDependencies(dependencies, sessionDependencies(later)).some(d => d.reason === "source-field-removed")).toBe(true);
  const reordered = structuredClone(original); reordered.phases.reverse();
  const changes = changedDependencies(dependencies, sessionDependencies(reordered));
  expect(changes.some(d => d.source.scope === "session" && d.source.field === "phases.$order")).toBe(true);
  expect(changes.some(d => d.source.scope === "node" && d.source.field === "title")).toBe(false);
 });
 it("does not conflate equal words in different lessons or nodes", () => {
  const a = source(); const b = {...source(), id: "another-lesson"};
  const dependencies = sessionDependencies(a);
  expect(changedDependencies(dependencies, sessionDependencies(b)).every(d => d.currentRevision === null)).toBe(true);
 });
});
