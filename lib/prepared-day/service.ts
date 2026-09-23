import { randomUUID } from "node:crypto";
import { buildComposerContext } from "./context-pack";
import { type PreparationInput, type Composition, projectComposition, revisionOf, snapshotInput } from "./snapshot";
import type { ChangedDependency } from "@/lib/content/dependencies";
import { preparationUsageSchema, type PreparationUsage } from "./usage";
import type { Session } from "@/schema/pack";

export type StoredPreparation = PreparationInput & {
  id: string; teacherId: string; requestKey: string; inputHash: string;
  sourceRevision: string; status: "pending" | "composing" | "proposed" | "failed";
  proposalRevision: string | null; composition: Composition | null;
  composedSession: Session | null; failureCode: string | null;
  sourceFreshness?: { state: "fresh" | "stale" | "source-unavailable"; changes: ChangedDependency[] };
  usage?: PreparationUsage;
};

export interface PreparationStore {
  /** Atomic insert-if-absent, returning the existing row on a duplicate key. */
  reserve(record: StoredPreparation): Promise<StoredPreparation>;
  /** Compare-and-set pending -> composing. Only its winner may call a model. */
  claim(teacherId: string, id: string): Promise<boolean>;
  read(teacherId: string, id: string): Promise<StoredPreparation | null>;
  finish(teacherId: string, id: string, result: Pick<StoredPreparation, "proposalRevision" | "composition" | "composedSession">): Promise<void>;
  fail(teacherId: string, id: string, code: string): Promise<void>;
}

export type Composer = (input: PreparationInput & { contextPack: ReturnType<typeof buildComposerContext> }) => Promise<Composition | null>;

/** One durable attempt, independent of the request that happens to finish it.
 * No provider retry: after a timeout/crash its outcome is uncertain. A teacher
 * can request a NEW preparation, while retries of this key only read memory.
 * The concrete prompt/model adapter lands in #1088; views never call it. */
export async function prepareLesson(
  store: PreparationStore,
  composer: Composer,
  input: PreparationInput & { teacherId: string; requestKey: string; usage?: PreparationUsage },
  enabled: boolean,
): Promise<StoredPreparation> {
  if (!input.teacherId || !input.requestKey) throw new Error("Preparation needs an owner and request key");
  const snapshot = snapshotInput(input);
  const sourceRevision = revisionOf(snapshot.source);
  const usage = preparationUsageSchema.parse(input.usage ?? {kind: "production"});
  // Preserve existing production request identities. Non-production attempts
  // bind their immutable dataset classification into their request identity.
  const inputHash = revisionOf(usage.kind === "production" ? snapshot : {...snapshot, usage});
  const existing = await store.reserve({
    ...snapshot, id: randomUUID(), teacherId: input.teacherId, requestKey: input.requestKey,
    inputHash, sourceRevision, usage, status: "pending", proposalRevision: null,
    composition: null, composedSession: null, failureCode: null,
  });
  if (existing.inputHash !== inputHash) throw new Error("Request key already names different preparation inputs");
  if (existing.status !== "pending") return existing;
  if (!await store.claim(input.teacherId, existing.id)) {
    const current = await store.read(input.teacherId, existing.id);
    if (!current) throw new Error("Preparation disappeared");
    return current;
  }
  if (!enabled) {
    await store.fail(input.teacherId, existing.id, "kill-flag-set");
  } else {
    // The provider gets a copy of the saved inputs, never a mutable live class
    // or today's source. A source edit while it runs cannot relabel the result.
    let answer: Composition | null = null;
    try {
      const contextPack = buildComposerContext({source: existing.source, context: existing.context});
      answer = await composer(structuredClone({source: existing.source, context: existing.context, contextPack}));
    }
    catch { /* Provider errors contain private inputs; store only the code. */ }
    if (!answer) {
      await store.fail(input.teacherId, existing.id, "model-unavailable");
    } else {
      let projected: ReturnType<typeof projectComposition> | null = null;
      try { projected = projectComposition(existing.source, answer, existing.context); }
      catch { /* The judge owns prose; this refusal is a malformed address map. */ }
      if (!projected) await store.fail(input.teacherId, existing.id, "invalid-proposal-shape");
      else await store.finish(input.teacherId, existing.id, {
        proposalRevision: revisionOf({sourceRevision, contextRevision: existing.context.revisionId, ...projected}),
        composition: projected.composition, composedSession: projected.session,
      });
    }
  }
  const saved = await store.read(input.teacherId, existing.id);
  if (!saved) throw new Error("Preparation disappeared");
  return saved;
}
