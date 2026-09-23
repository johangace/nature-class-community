import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sessionSchema } from "@/schema/pack";
import { projectCoreSessionV1 } from "@/lib/offline/core-session";
const lesson=sessionSchema.parse(JSON.parse(readFileSync("packs/autumn-starter.json","utf8")).sessions.find((s:{id:string})=>s.id==="animal-leaf-masks"));
describe("rain author context stays attached to its source",()=>{
 it("attaches notes to the current phase identities and leaves introduce without filler",()=>{
  expect(lesson.phases.filter(p=>p.authorNotes).map(p=>[p.key,p.nid])).toEqual([["collect","p8"],["sort","p17"],["create","p23"],["show-tell","p30"],["circle","p38"]]);
  expect(lesson.authorNotes).toBeTruthy();expect(lesson.phases[0]!.authorNotes).toBeUndefined();
 });
 it("does not put author context into the public offline teaching copy",()=>{
  const copy=projectCoreSessionV1(lesson);
  expect(copy.authorNotes).toBeUndefined();expect(copy.phases.every(p=>p.authorNotes===undefined)).toBe(true);
  expect(copy.phases.map(p=>p.durationMin)).toEqual([5,5,4,12,8,6]);
  expect(copy.durationMin).toBe(40);
 });
 it("has no length cap or required boilerplate",()=>{
  expect(sessionSchema.safeParse({...lesson,authorNotes:""}).success).toBe(true);
  expect(sessionSchema.safeParse({...lesson,authorNotes:"A thought. ".repeat(1000)}).success).toBe(true);
 });
});
