import type { Session } from "@/schema/pack";
import { sourceFieldRefSchema, type SourceFieldRef } from "@/schema/prepared-day";
import { revisionOf } from "@/lib/prepared-day/snapshot";

export type FieldDependency = { source: SourceFieldRef; valueRevision: string };
export type ChangedDependency = FieldDependency & { currentRevision: string | null; reason: "source-field-changed" | "source-field-removed" };
export const sourceAddress = (source: SourceFieldRef): string => JSON.stringify(sourceFieldRefSchema.parse(source));

/** All inputs consumed by a whole-day composer. Containers record membership
 * separately: an inserted activity matters even though no old leaf changed.
 * Descendant nodes never inherit a parent's positional address. */
export function sessionDependencies(session: Session): FieldDependency[] {
  const result: FieldDependency[] = [];
  const ids = new Set<string>();
  function add(nid: string | undefined, field: string, value: unknown) {
    const source: SourceFieldRef = nid
      ? { scope: "node", sessionId: session.id, nid, field }
      : { scope: "session", sessionId: session.id, field };
    result.push({ source, valueRevision: revisionOf(value) });
  }
  function walk(value: unknown, path: string[], nid?: string) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const own = (value as Record<string, unknown>).nid;
      if (typeof own === "string") {
        if (ids.has(own)) throw new Error("Duplicate dependency node identity");
        add(nid, [...path, "$node"].join("."), own);
        ids.add(own); nid = own; path = [];
      }
      const entries = Object.entries(value).filter(([key, child]) => key !== "nid" && key !== "nodeSeq" && child !== undefined);
      add(nid, [...path, "$keys"].join("."), entries.map(([key]) => key).sort());
      for (const [key, child] of entries) walk(child, [...path, key], nid);
    } else if (Array.isArray(value)) {
      add(nid, [...path, "$order"].join("."), value.map((child, i) =>
        child && typeof child === "object" && typeof child.nid === "string" ? child.nid : i));
      value.forEach((child, i) => walk(child, [...path, String(i)], nid));
    } else {
      add(nid, path.join("."), value);
    }
  }
  walk(session, []);
  return result.sort((a, b) => sourceAddress(a.source).localeCompare(sourceAddress(b.source)));
}

/** Compare each consumed value, not whole-lesson or immediately-previous
 * revisions. An R1 preparation is still found after unrelated R2 edits. */
export function changedDependencies(saved: readonly FieldDependency[], current: readonly FieldDependency[]): ChangedDependency[] {
  const values = new Map(current.map(d => [sourceAddress(d.source), d.valueRevision]));
  return saved.flatMap(dependency => {
    const currentRevision = values.get(sourceAddress(dependency.source)) ?? null;
    return currentRevision === dependency.valueRevision ? [] : [{
      ...dependency, currentRevision,
      reason: currentRevision === null ? "source-field-removed" as const : "source-field-changed" as const,
    }];
  });
}
