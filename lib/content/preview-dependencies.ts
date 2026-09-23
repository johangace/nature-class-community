import type { Session } from "@/schema/pack";
import type { SourceFieldRef } from "@/schema/prepared-day";
import { previewDeck } from "@/lib/lesson/preview";
import { revisionOf } from "@/lib/prepared-day/snapshot";
import { sourceAddress, type FieldDependency } from "./dependencies";

const MISSING = { missingSourceField: true };
/** Read an explicitly named source, including structural dependencies. No
 * reverse matching of equal strings, and no invented ids for shared sources. */
export function dependencyValue(source: SourceFieldRef, session: Session, shared: Record<string, unknown> = {}): unknown {
  let value: unknown = source.scope === "shared" ? shared[source.sourceId] : session;
  if (source.scope !== "shared" && source.sessionId !== session.id) return MISSING;
  if (source.scope === "node") {
    const matches: unknown[] = [];
    const targetNid = source.nid;
    function find(v: unknown) {
      if (!v || typeof v !== "object") return;
      if (!Array.isArray(v) && "nid" in v && v.nid === targetNid) matches.push(v);
      Object.values(v).forEach(find);
    }
    find(session);
    if (matches.length > 1) throw new Error("Duplicate artifact source identity");
    value = matches[0];
  }
  for (const part of source.field.split(".")) {
    if (part === "$order") return Array.isArray(value) ? value.map((v, i) => v && typeof v === "object" && typeof v.nid === "string" ? v.nid : i) : MISSING;
    if (part === "$teacherNotes") {
      if (!value || typeof value !== "object" || !("blocks" in value) || !Array.isArray(value.blocks)) return MISSING;
      return value.blocks.flatMap((block, i) => block.type === "teacher-note" ? [block.nid ?? i] : []);
    }
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return MISSING;
    value = (value as Record<string, unknown>)[part];
  }
  return value ?? (value === null ? null : MISSING);
}

export function previewDependencies(session: Session, shared: Record<string, unknown> = {}, sharedSettleInserted = false) {
  const sources = new Map<string, FieldDependency[]>();
  const cards = previewDeck(session, {
    phaseSource(index, field) {
      // loadPack explicitly inserts shared settling first when this flag is on.
      if (sharedSettleInserted && index === 0) return {scope: "shared", sourceId: "settle", field: `phase.${field}`};
    },
    narrationSources(card, refs) {
      const unique = new Map(refs.map(source => [sourceAddress(source), source]));
      sources.set(card, [...unique.values()].map(source => ({source, valueRevision: revisionOf(dependencyValue(source, session, shared))})));
    },
  });
  return {cards, sources};
}
