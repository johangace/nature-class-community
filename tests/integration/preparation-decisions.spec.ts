import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sessionSchema } from "@/schema/pack";
import { contextRevisionSchema } from "@/schema/prepared-day";
import { createPreparationStore } from "@/lib/prepared-day/store";
import { prepareLesson } from "@/lib/prepared-day/service";
import { nodeTextFields, type Composition } from "@/lib/prepared-day/snapshot";
import { createDecisionLedger } from "@/lib/prepared-day/decisions";
import type { PreparationUsage } from "@/lib/prepared-day/usage";

describe.skipIf(!process.env.DATABASE_URL)("durable preparation decision memory",()=>{
 const db=new PrismaClient();const owners:string[]=[];
 afterAll(async()=>{await db.user.deleteMany({where:{id:{in:owners}}});await db.$disconnect();});
 it("isolates owners, deduplicates decisions, binds revisions and excludes all evaluation before retrieval",async()=>{
  const owner=await db.user.create({data:{email:`decisions-${randomUUID()}@example.test`}});owners.push(owner.id);
  const source=sessionSchema.parse(JSON.parse(readFileSync("packs/autumn-starter.json","utf8")).sessions.find((s:{id:string})=>s.id==="animal-leaf-masks"));
  const context=contextRevisionSchema.parse({revisionId:randomUUID(),placeKey:{resolution:"koppen",value:"Cfb",resolvedBy:"test"},ability:{band:null,resolvedBy:"base"},weather:{reach:"the-planned-hour",conditionKind:null,reasonCode:"not-asked",observedAt:null,validUntil:null,source:null},siteProfile:null,plannedAt:"2026-09-09T10:00:00Z",plannedTimeZone:"Europe/London",jurisdiction:null,locale:null,teacherNotes:[],capturedAt:"2026-09-08T10:00:00Z"});
  const answer:Composition={lines:[...nodeTextFields(source).values()].map(({nid,field,text})=>({nid,field,text,reason:"Unchanged",origins:[{scope:"node",sessionId:source.id,nid,field}]})),outcome:"no-change-needed",promptVersion:"fixture",modelVersion:"fixture"};
  const store=createPreparationStore(db);const ledger=createDecisionLedger(db);
  const create=(usage:PreparationUsage)=>prepareLesson(store,async()=>answer,{teacherId:owner.id,requestKey:randomUUID(),source,context,usage},true);
  const saved=await create({kind:"production"});
  const input={preparedId:saved.id,requestKey:randomUUID(),decidedRevision:saved.proposalRevision!,reasonCode:"dismissed-materials-missing",note:"No glue available"};
  await expect(ledger.dismiss("another-owner",input)).rejects.toThrow("not found");
  const decisions=await Promise.all(Array.from({length:8},()=>ledger.dismiss(owner.id,input)));
  expect(decisions.every(d=>d.decidedRevision===saved.proposalRevision)).toBe(true);
  expect(await db.preparationDecision.count({where:{preparedId:saved.id}})).toBe(1);
  await expect(ledger.dismiss(owner.id,{...input,note:"different request"})).rejects.toThrow("different decision");
  await expect(ledger.dismiss(owner.id,{...input,decision:"accepted"})).rejects.toThrow();
  await expect(ledger.dismiss(owner.id,{...input,requestKey:randomUUID(),decidedRevision:"not-the-proposal"})).rejects.toThrow("revision");
  for(const usage of [{kind:"test"},{kind:"evaluation",datasetId:"rain",split:"held-out"},{kind:"evaluation",datasetId:"rain",split:"training"}] as PreparationUsage[]){
    const evaluation=await create(usage);
    await ledger.dismiss(owner.id,{...input,preparedId:evaluation.id,requestKey:randomUUID(),decidedRevision:evaluation.proposalRevision});
  }
  const retrieved=await ledger.forLesson(owner.id,source.id,context,1);
  expect(retrieved).toHaveLength(1);expect(retrieved[0]!.decision.preparedId).toBe(saved.id);
  expect(await ledger.forLesson("another-owner",source.id)).toEqual([]);
  const before=await db.preparedLesson.findUniqueOrThrow({where:{id:saved.id}});
  expect(before.proposalRevision).toBe(saved.proposalRevision);expect(before.status).toBe("proposed");
  // A later revision cannot receive a NEW event for the old text; an identical
  // retry still returns its already-committed historical receipt.
  await db.preparedLesson.update({where:{id:saved.id},data:{proposalRevision:"later-fixture-revision"}});
  expect(await ledger.dismiss(owner.id,input)).toEqual(decisions[0]);
  await expect(ledger.dismiss(owner.id,{...input,requestKey:randomUUID()})).rejects.toThrow("revision");
  await db.user.delete({where:{id:owner.id}});
  expect(await db.preparationDecision.count({where:{preparedId:saved.id}})).toBe(0);
 });
});
