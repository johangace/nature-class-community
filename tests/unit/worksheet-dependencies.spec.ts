import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sessionSchema } from "@/schema/pack";
import { renderChildSheet, sheetFolioLine } from "@/engine/sheet-templates";
import { traceWorksheet } from "@/lib/content/worksheet-dependencies";
import { changedDependencies } from "@/lib/content/dependencies";
const raw=JSON.parse(readFileSync("packs/autumn-starter.json","utf8"));
const lesson=()=>sessionSchema.parse(raw.sessions.find((s:{id:string})=>s.id==="animal-leaf-masks"));
const pack={id:raw.id,title:raw.title,sessionIds:raw.sessions.map((s:{id:string})=>s.id)};
describe("real worksheet source reads",()=>{
 it("matches the existing renderer and includes template-owned teaching copy",()=>{
  const session=lesson();const traced=traceWorksheet(session,"y1",pack);
  const rendered=renderChildSheet(session,{blocks:session.childSheet,ability:"y1",folio:{where:sheetFolioLine(pack.title,pack.sessionIds.indexOf(session.id))}});
  expect(traced.html).toBe(renderToStaticMarkup(rendered!));
  expect(traced.html).toContain("Keep the eye openings clear");
  expect(traced.sources.some(d=>d.source.scope==="shared" && d.source.sourceId==="engine/sheet-templates/animal-mask.tsx")).toBe(true);
 });
 it("tracks a worksheet node edit without treating an unrelated spoken line as worksheet input",()=>{
  const source=lesson();const before=traceWorksheet(source,"y1",pack);
  const changed=structuredClone(source);const spoken=changed.phases.flatMap(p=>p.blocks).find(b=>b.type==="say-aloud")!;
  if(spoken.type!=="say-aloud")throw Error("fixture");spoken.text+=" Unrelated change.";
  expect(traceWorksheet(changed,"y1",pack)).toEqual(before);
  const title=changed.childSheet.find(b=>b.type==="sheet-title")!;
  if(title.type!=="sheet-title")throw Error("fixture");title.title="A different worksheet title";
  const after=traceWorksheet(changed,"y1",pack);expect(after.html).not.toBe(before.html);
  expect(changedDependencies(before.sources,after.sources)).toEqual([expect.objectContaining({source:{scope:"node",sessionId:source.id,nid:title.nid,field:"title"}})]);
 });
 it("records empty-sheet membership so adding a worksheet is detectable",()=>{
  const source=lesson();source.childSheet=[];
  const before=traceWorksheet(source,undefined,pack);expect(before.html).toBe("");
  expect(before.sources.some(d=>d.source.field==="childSheet.$order")).toBe(true);
  const after=traceWorksheet(lesson(),undefined,pack);expect(changedDependencies(before.sources,after.sources).length).toBeGreaterThan(0);
 });
});
