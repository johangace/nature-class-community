import { createHash } from "node:crypto";
import { z } from "zod";
import { sessionSchema, readNodeId, type NodeIdKind, type Phase, type Session } from "@/schema/pack";
import { contextRevisionSchema, nodeRefSchema, sourceFieldRefSchema, type ContextRevision } from "@/schema/prepared-day";

/** Object insertion order is not a content change; array order is. */
export function revisionOf(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
    : v !== null && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, canonical(x)]))
      : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export const contextOriginSchema = z.object({
  contextRevision: z.string().min(1),
  field: z.string().min(1),
  valueRevision: z.string().min(1),
}).strict();

/** Exact leaf values, including explicit absences, of the saved context. */
export function contextFields(context: ContextRevision): Map<string, unknown> {
  const fields = new Map<string, unknown>();
  function walk(value: unknown, path: string) {
    if (value !== null && typeof value === "object" && Object.keys(value).length) {
      for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key);
    } else fields.set(path, value);
  }
  walk(context, "");
  return fields;
}

export const proposedLineSchema = z.object({
  nid: nodeRefSchema,
  field: z.string().min(1),
  text: z.string(),
  reason: z.string().min(1),
  // These are inputs to a proposal, never a claim that it has been accepted.
  origins: z.array(sourceFieldRefSchema).min(1),
  contextOrigins: z.array(contextOriginSchema).optional(),
}).strict();
export const compositionSchema = z.object({
  lines: z.array(proposedLineSchema),
  promptVersion: z.string().min(1),
  modelVersion: z.string().min(1),
  outcome: z.enum(["composed", "no-change-needed"]),
}).strict();
export type Composition = z.infer<typeof compositionSchema>;

export type PreparationInput = { source: Session; context: ContextRevision };
export function snapshotInput(input: PreparationInput): PreparationInput {
  // Clone and validate before an async boundary, so callers cannot change the
  // teacher's chosen day while a provider call is in flight.
  const source = sessionSchema.parse(structuredClone(input.source));
  assertMintedSource(source);
  const context = contextRevisionSchema.parse(structuredClone(input.context));
  new Intl.DateTimeFormat("en", { timeZone: context.plannedTimeZone });
  return { source, context };
}

function assertMintedSource(source: Session): void {
  const ids = new Set<string>();
  function requireNode(node: { nid?: string }, kind: NodeIdKind) {
    const parsed = node.nid ? readNodeId(node.nid) : null;
    if (!parsed || parsed.kind !== kind || parsed.seq > (source.nodeSeq ?? -1) || ids.has(node.nid!)) {
      throw new Error("Preparation requires complete, unique minted node identities");
    }
    ids.add(node.nid!);
  }
  function phaseNodes(phase: Phase) {
    requireNode(phase, "phase");
    for (const block of phase.blocks) requireNode(block, "block");
    for (const tip of phase.tips ?? []) requireNode(tip, "tip");
    for (const variant of phase.conditionVariants ?? []) { requireNode(variant, "variant"); phaseNodes(variant.phase); }
  }
  source.phases.forEach(phaseNodes);
  source.childSheet.forEach(block => requireNode(block, "block"));
}

/** Enumerate exact text addresses, carrying the closest node identity. */
export function nodeTextFields(source: Session, includeReadOnlyContext = false): Map<string, { nid: string; field: string; text: string; path: string[] }> {
  const result = new Map<string, { nid: string; field: string; text: string; path: string[] }>();
  const ids = new Set<string>();
  function walk(value: unknown, path: string[], nid?: string, relative: string[] = []) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const own = (value as Record<string, unknown>).nid;
      if (typeof own === "string") {
        nodeRefSchema.parse(own);
        if (ids.has(own)) throw new Error("Duplicate source node identity");
        ids.add(own); nid = own; relative = [];
      }
    }
    if (typeof value === "string" && nid && relative.length &&
      (includeReadOnlyContext || !(nid.startsWith("v") && relative[0] === "when")) && !["nid", "type", "kind", "key", "src", "url", "author", "authorship", "purpose", "mode", "materialPurpose", ...(includeReadOnlyContext ? [] : ["authorNotes", "mark"])].some(key => relative.includes(key))) {
      const field = relative.join(".");
      result.set(`${nid}:${field}`, { nid, field, text: value, path });
    } else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, [...path, key], nid, [...relative, key]);
    }
  }
  walk(source, []);
  return result;
}

/** This checks addresses and revision integrity, never the meaning of prose.
 * The complete-day judge owns whether a proposal is true, safe and faithful. */
export function projectComposition(source: Session, raw: unknown, context?: ContextRevision): { composition: Composition; session: Session } {
  assertMintedSource(source);
  const composition = compositionSchema.parse(raw);
  const fields = nodeTextFields(source);
  const origins = nodeTextFields(source, true);
  const session = structuredClone(source);
  const savedContext = context ? contextRevisionSchema.parse(context) : undefined;
  const contextValues = savedContext ? contextFields(savedContext) : new Map<string, unknown>();
  const seen = new Set<string>();
  for (const line of composition.lines) {
    const key = `${line.nid}:${line.field}`;
    const target = fields.get(key);
    if (!target || seen.has(key)) throw new Error("Missing or duplicate proposal target");
    seen.add(key);
    for (const origin of line.origins) {
      if (origin.scope === "shared") throw new Error("Shared input was not captured in this preparation");
      if (origin.sessionId !== source.id) throw new Error("Origin belongs to another lesson");
      if (origin.scope === "node" && !origins.has(`${origin.nid}:${origin.field}`)) throw new Error("Missing source origin");
      if (origin.scope === "session" && !Object.hasOwn(source, origin.field)) throw new Error("Missing session origin");
    }
    for (const origin of line.contextOrigins ?? []) {
      if (!savedContext || origin.contextRevision !== savedContext.revisionId ||
          !contextValues.has(origin.field) || revisionOf(contextValues.get(origin.field)) !== origin.valueRevision) {
        throw new Error("Context origin does not name the saved input");
      }
    }
    let parent: Record<string, unknown> = session as unknown as Record<string, unknown>;
    for (const part of target.path.slice(0, -1)) parent = parent[part] as Record<string, unknown>;
    parent[target.path.at(-1)!] = line.text;
  }
  // A whole-day response accounts for every source text field, including
  // unchanged ones. Omission cannot masquerade as a no-change decision.
  if (seen.size !== fields.size) throw new Error("Proposal did not account for the whole day");
  if (composition.outcome === "no-change-needed" && revisionOf(session) !== revisionOf(source)) throw new Error("No-change outcome changed the source");
  return { composition, session: sessionSchema.parse(session) };
}
