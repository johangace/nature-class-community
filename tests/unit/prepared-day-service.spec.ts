import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { sessionSchema } from "@/schema/pack";
import { contextRevisionSchema } from "@/schema/prepared-day";
import { nodeTextFields, projectComposition, revisionOf, type Composition } from "@/lib/prepared-day/snapshot";
import { prepareLesson, type PreparationStore, type StoredPreparation } from "@/lib/prepared-day/service";

const source = sessionSchema.parse(JSON.parse(readFileSync("packs/autumn-starter.json", "utf8")).sessions.find((s: {id:string}) => s.id === "animal-leaf-masks"));
const context = contextRevisionSchema.parse({
  revisionId:"context-1", placeKey:{resolution:"koppen",value:"Cfb",resolvedBy:"pack-key@1"},
  ability:{band:null,resolvedBy:"ability@1/base"},
  weather:{reach:"the-planned-hour",conditionKind:null,reasonCode:"not-asked",observedAt:null,validUntil:null,source:null},
  siteProfile:null, plannedAt:"2026-09-09T10:00:00Z",plannedTimeZone:"Europe/London",
  jurisdiction:null,locale:"en-GB",teacherNotes:[],capturedAt:"2026-09-08T10:00:00Z",
});
function unchanged(): Composition {
  return {lines:[...nodeTextFields(source).values()].map(({nid,field,text}) => ({nid,field,text,reason:"No change needed",origins:[{scope:"node",sessionId:source.id,nid,field}]})),promptVersion:"test-only",modelVersion:"test-only",outcome:"no-change-needed"};
}
class Memory implements PreparationStore {
  rows = new Map<string,StoredPreparation>();
  async reserve(r:StoredPreparation) {
    const existing=[...this.rows.values()].find(x=>x.teacherId===r.teacherId && x.requestKey===r.requestKey);
    if(existing)return structuredClone(existing);
    this.rows.set(r.id,structuredClone(r));return structuredClone(r);
  }
  async read(teacherId:string,id:string) {const r=this.rows.get(id);return r?.teacherId===teacherId?structuredClone(r):null;}
  async claim(teacherId:string,id:string) {const r=this.rows.get(id);if(r?.teacherId!==teacherId||r.status!=="pending")return false;r.status="composing";return true;}
  async finish(teacherId:string,id:string,result:Pick<StoredPreparation,"proposalRevision"|"composition"|"composedSession">) {const r=this.rows.get(id)!;expect(r.teacherId).toBe(teacherId);expect(r.status).toBe("composing");Object.assign(r,structuredClone(result),{status:"proposed"});}
  async fail(teacherId:string,id:string,code:string) {const r=this.rows.get(id)!;expect(r.teacherId).toBe(teacherId);r.status="failed";r.failureCode=code;}
}
const input=()=>({source:structuredClone(source),context:structuredClone(context),teacherId:"teacher-a",requestKey:"request-1"});

describe("durable whole-day preparation",()=>{
  it("concurrent requests invoke the composer once and all later reads reuse the saved proposal",async()=>{
    const store=new Memory();let release!:(c:Composition)=>void;
    const compose=vi.fn(()=>new Promise<Composition>(resolve=>{release=resolve;}));
    const first=prepareLesson(store,compose,input(),true);
    await vi.waitFor(()=>expect(compose).toHaveBeenCalledTimes(1));
    const retry=await prepareLesson(store,compose,input(),true);
    expect(retry.status).toBe("composing");release(unchanged());
    const saved=await first;
    const again=await prepareLesson(store,compose,input(),false);
    expect(again).toEqual(saved);expect(compose).toHaveBeenCalledTimes(1);
    expect(saved.sourceRevision).toBe(revisionOf(source));
    expect(saved.context).toEqual(context);expect(saved.composition!.lines.length).toBeGreaterThan(10);
  });
  it("assembles composer data from the durable saved source and validates its context origins",async()=>{
    const store=new Memory();
    const compose=vi.fn(async (received: Parameters<import("@/lib/prepared-day/service").Composer>[0])=>{
      expect(received.contextPack.sourceRevision).toBe(revisionOf(received.source));
      const answer=unchanged();
      answer.lines[0]!.contextOrigins=[received.contextPack.contextFacts.find(f=>f.origin.field==="ability.band")!.origin];
      return answer;
    });
    const saved=await prepareLesson(store,compose,input(),true);
    expect(saved.status).toBe("proposed");expect(saved.composition!.lines[0]!.contextOrigins).toHaveLength(1);
  });
  it("refuses key reuse with changed inputs and does not cross teacher ownership",async()=>{
    const store=new Memory();const compose=vi.fn(async()=>unchanged());
    const saved=await prepareLesson(store,compose,input(),true);
    const changed=input();changed.context.jurisdiction="england";
    await expect(prepareLesson(store,compose,changed,true)).rejects.toThrow("different preparation inputs");
    expect(await store.read("teacher-b",saved.id)).toBeNull();
    expect(compose).toHaveBeenCalledTimes(1);
  });
  it("freezes source and context before provider work begins",async()=>{
    const store=new Memory();const original=input();
    const compose=vi.fn(async()=>{original.source.title="Different topic";original.context.locale="us";return unchanged();});
    const saved=await prepareLesson(store,compose,original,true);
    expect(saved.source.title).toBe(source.title);expect(saved.context.locale).toBe("en-GB");
  });
  it("never automatically retries an uncertain provider outcome",async()=>{
    const store=new Memory();const compose=vi.fn(async()=>{throw Error("private provider detail");});
    const failed=await prepareLesson(store,compose,input(),true);
    expect(failed.failureCode).toBe("model-unavailable");
    await prepareLesson(store,compose,input(),true);expect(compose).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(failed)).not.toContain("private provider detail");
  });
  it("refuses a missing source node identity before reserving or composing",async()=>{
    const store=new Memory();const compose=vi.fn(async()=>unchanged());const unmapped=input();
    delete unmapped.source.phases[0]!.blocks[0]!.nid;
    await expect(prepareLesson(store,compose,unmapped,true)).rejects.toThrow("minted node");
    expect(store.rows.size).toBe(0);expect(compose).not.toHaveBeenCalled();
  });
  it("binds trusted evaluation classification into the immutable request",async()=>{
    const store=new Memory();const compose=vi.fn(async()=>unchanged());
    const evaluation={...input(),usage:{kind:"evaluation" as const,datasetId:"rain",split:"held-out" as const}};
    const saved=await prepareLesson(store,compose,evaluation,true);
    expect(saved.usage).toEqual(evaluation.usage);
    await expect(prepareLesson(store,compose,{...input(),usage:{kind:"production"}},true)).rejects.toThrow("different preparation inputs");
    expect(compose).toHaveBeenCalledTimes(1);
  });
  it("kill flag stops new composition",async()=>{
    const compose=vi.fn(async()=>unchanged());
    expect((await prepareLesson(new Memory(),compose,input(),false)).failureCode).toBe("kill-flag-set");
    expect(compose).not.toHaveBeenCalled();
  });
  it("rejects missing lines, duplicate targets and origins from a different lesson",()=>{
    const missing=unchanged();missing.lines.pop();expect(()=>projectComposition(source,missing)).toThrow("whole day");
    const duplicate=unchanged();duplicate.lines.push(duplicate.lines[0]!);expect(()=>projectComposition(source,duplicate)).toThrow("duplicate");
    const foreign=unchanged();foreign.lines[0]!.origins=[{scope:"node",sessionId:"minibeasts",nid:"b2",field:"text"}];
    expect(()=>projectComposition(source,foreign)).toThrow("another lesson");
    const inherited=unchanged();inherited.lines[0]!.origins=[{scope:"session",sessionId:source.id,field:"toString"}];
    expect(()=>projectComposition(source,inherited)).toThrow("Missing session origin");
  });
  it("source field addresses follow node reordering and never change the canonical session",()=>{
    const reordered=structuredClone(source);reordered.phases.reverse();
    const projected=projectComposition(reordered,unchanged());
    expect(projected.session).toEqual(reordered);expect(source.phases[0]!.key).not.toBe(reordered.phases[0]!.key);
  });
  it("keeps a condition selector as source context, not editable teaching text",()=>{
    const selector=source.phases.flatMap(p=>p.conditionVariants??[])[0]!;
    expect(nodeTextFields(source).has(`${selector.nid}:when`)).toBe(false);
    expect(nodeTextFields(source,true).get(`${selector.nid}:when`)!.text).toBe(selector.when);
    const attempt=unchanged();attempt.lines.push({nid:selector.nid!,field:"when",text:"dry",reason:"Changed selector",origins:[{scope:"node",sessionId:source.id,nid:selector.nid!,field:"when"}]});
    expect(()=>projectComposition(source,attempt)).toThrow("Missing");
  });
  it("never treats a drawing asset selector as teaching prose",()=>{
    const drawing=sessionSchema.parse(JSON.parse(readFileSync("packs/autumn-starter.json","utf8")).sessions.find((s:{id:string})=>s.id==="leaves-and-their-trees"));
    const marks=[...nodeTextFields(drawing,true).values()].filter(f=>f.field.endsWith(".mark"));
    expect(marks.length).toBeGreaterThan(0);
    for(const mark of marks)expect(nodeTextFields(drawing).has(`${mark.nid}:${mark.field}`)).toBe(false);
  });
  it("refuses empty coverage for an unminted source even through direct projection",()=>{
    const unminted=structuredClone(source);delete unminted.phases[0]!.nid;
    expect(()=>projectComposition(unminted,{...unchanged(),lines:[]})).toThrow("minted node");
  });
  it("a no-change result cannot conceal changed wording",()=>{
    const falseNoChange=unchanged();falseNoChange.lines[0]!.text+=" changed";
    expect(()=>projectComposition(source,falseNoChange)).toThrow("No-change");
  });
});
