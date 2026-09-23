import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { AbilityBand, Session } from "@/schema/pack";
import type { SourceFieldRef } from "@/schema/prepared-day";
import { renderChildSheet, resolveSheetTemplate, sheetFolioLine } from "@/engine/sheet-templates";
import { revisionOf } from "@/lib/prepared-day/snapshot";
import { sourceAddress, type FieldDependency } from "./dependencies";

/** Build-time read tracing over plain authored data. The real renderer chooses
 * fields/variants; this observer owns no second list of teaching fields. */
export function traceWorksheet(session: Session, ability: AbilityBand | undefined, pack: {id: string; title: string; sessionIds: string[]}) {
  const sources = new Map<string, FieldDependency>();
  function add(source: SourceFieldRef, value: unknown) {
    sources.set(sourceAddress(source), {source, valueRevision: revisionOf(value === undefined ? {absent: true} : {value})});
  }
  function trace<T extends object>(object: T, address: SourceFieldRef): T {
    if ("nid" in object && typeof object.nid === "string") address = {scope:"node",sessionId:session.id,nid:object.nid,field:""};
    return new Proxy(object, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (typeof key !== "string" || typeof value === "function") return value;
        const field = address.field ? `${address.field}.${key}` : key;
        if (Array.isArray(target) && key === "length") {
          add({...address,field:`${address.field}.$order`}, target.map((v,i)=>v?.nid ?? i));
        } else if (value !== null && typeof value === "object") return trace(value, {...address,field});
        else if (key !== "nid") add({...address,field}, value);
        return value;
      },
      ownKeys(target) {
        add({...address,field:address.field ? `${address.field}.$keys` : "$keys"}, Object.keys(target));
        return Reflect.ownKeys(target);
      },
      has(target,key) {
        if(typeof key === "string") add({...address,field:address.field ? `${address.field}.${key}.$present` : `${key}.$present`},Object.hasOwn(target,key));
        return Reflect.has(target,key);
      },
    });
  }
  const observed = trace(session,{scope:"session",sessionId:session.id,field:""});
  const template = resolveSheetTemplate(observed);
  const element = renderChildSheet(observed,{blocks:observed.childSheet,ability,folio:{where:sheetFolioLine(pack.title,pack.sessionIds.indexOf(session.id))}});
  // Rendering completes nested components too, including template-owned copy.
  const html = element ? renderToStaticMarkup(element) : "";
  for(const [field,value] of Object.entries({title:pack.title,"sessions.$order":pack.sessionIds})) add({scope:"shared",sourceId:`packs/${pack.id}.json`,field},value);
  const templateFile = template === "animal-mask" ? "animal-mask" : template === "a5-collage" ? "a5-collage" : template === "field-card" ? "field-card" : "activity-sheet";
  for(const path of new Set(["engine/sheet-templates/index.tsx",`engine/sheet-templates/${templateFile}.tsx`,...(["animal-mask", "a5-collage"].includes(template) ? ["engine/sheet-templates/field-card.tsx"] : []),"engine/child-sheet.tsx","lib/text.ts","app/Wordmark.tsx"])) {
    add({scope:"shared",sourceId:path,field:"file"},readFileSync(path,"utf8"));
  }
  return {html,sources:[...sources.values()].sort((a,b)=>sourceAddress(a.source).localeCompare(sourceAddress(b.source)))};
}
