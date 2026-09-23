import { Prisma, type PreparedLesson, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { contextRevisionSchema, sourceFieldRefSchema } from "@/schema/prepared-day";
import { sessionSchema } from "@/schema/pack";
import { loadAuthoredPack, packOrder } from "@/lib/pack";
import type { Session } from "@/schema/pack";
import { sessionDependencies, changedDependencies, sourceAddress } from "@/lib/content/dependencies";
import { preparationUsageSchema } from "./usage";
import { compositionSchema } from "./snapshot";
import type { PreparationStore, StoredPreparation } from "./service";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
function decode(row: PreparedLesson): StoredPreparation {
  if (!["pending", "composing", "proposed", "failed"].includes(row.status)) throw new Error("Unknown preparation state");
  return {
    id: row.id, teacherId: row.teacherId, requestKey: row.requestKey,
    inputHash: row.inputHash, sourceRevision: row.sourceRevision,
    source: sessionSchema.parse(row.sourceSnapshot), context: contextRevisionSchema.parse(row.contextSnapshot),
    status: row.status as StoredPreparation["status"], proposalRevision: row.proposalRevision,
    composition: row.proposalSnapshot === null ? null : compositionSchema.parse(row.proposalSnapshot),
    composedSession: row.composedSession === null ? null : sessionSchema.parse(row.composedSession),
    failureCode: row.failureCode,
    usage: preparationUsageSchema.parse(row.usageClass === "evaluation"
      ? {kind: row.usageClass, datasetId: row.evaluationDataset, split: row.evaluationSplit}
      : {kind: row.usageClass}),
  };
}

/** Every query includes the teacher. No global id-only read/write API exists. */
export type CurrentSourceReader = (sessionId: string) => Session | null | Promise<Session | null>;
const currentSource: CurrentSourceReader = sessionId => {
  for (const packId of packOrder) {
    const source = loadAuthoredPack(packId).sessions.find(session => session.id === sessionId);
    if (source) return source;
  }
  return null;
};

export function createPreparationStore(
  client: Pick<PrismaClient, "preparedLesson" | "preparedSourceDependency"> = prisma,
  readSource: CurrentSourceReader = currentSource,
): PreparationStore & { affectedDays(teacherId: string, sessionId: string): Promise<StoredPreparation[]> } {
 async function withFreshness(row: PreparedLesson): Promise<StoredPreparation> {
  const saved = decode(row);
  const dependencies = await client.preparedSourceDependency.findMany({where: {preparedId: row.id}});
  if (!dependencies.length) return {...saved, sourceFreshness: {state: "source-unavailable", changes: []}};
  let source: Session | null;
  try { source = await readSource(row.sessionId); }
  catch { return {...saved, sourceFreshness: {state: "source-unavailable", changes: []}}; }
  const changes = changedDependencies(dependencies.map(d => ({source: sourceFieldRefSchema.parse(d.source), valueRevision: d.valueRevision})), source ? sessionDependencies(source) : []);
  return {...saved, sourceFreshness: {state: changes.length ? "stale" : "fresh", changes}};
 }
 return {
  async affectedDays(teacherId, sessionId) {
    const rows = await client.preparedLesson.findMany({where: {teacherId, sessionId}});
    const results = await Promise.all(rows.map(withFreshness));
    return results.filter(row => row.sourceFreshness?.state === "stale");
  },
  async reserve(record) {
    const key = { teacherId: record.teacherId, requestKey: record.requestKey };
    let row: PreparedLesson;
    try { row = await client.preparedLesson.upsert({
      where: { teacherId_requestKey: key }, update: {},
      create: {
        id: record.id, ...key, sessionId: record.source.id, inputHash: record.inputHash,
        sourceRevision: record.sourceRevision, contextRevision: record.context.revisionId,
        sourceSnapshot: json(record.source), contextSnapshot: json(record.context),
        sourceDependencies: {create: sessionDependencies(record.source).map(d => ({
          address: sourceAddress(d.source), source: json(d.source), valueRevision: d.valueRevision,
        }))},
        usageClass: record.usage?.kind ?? "production",
        evaluationDataset: record.usage?.kind === "evaluation" ? record.usage.datasetId : null,
        evaluationSplit: record.usage?.kind === "evaluation" ? record.usage.split : null,
      },
    }); } catch (error) {
      // Prisma may emulate upsert for a compound key. A simultaneous insert
      // losing its unique constraint is still the same durable request.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const winner = await client.preparedLesson.findUnique({ where: { teacherId_requestKey: key } });
      if (!winner) throw error;
      row = winner;
    }
    return withFreshness(row);
  },
  async claim(teacherId, id) {
    const result = await client.preparedLesson.updateMany({where: {id, teacherId, status: "pending"}, data: {status: "composing"}});
    return result.count === 1;
  },
  async read(teacherId, id) {
    const row = await client.preparedLesson.findFirst({where: {id, teacherId}});
    return row ? withFreshness(row) : null;
  },
  async finish(teacherId, id, result) {
    const changed = await client.preparedLesson.updateMany({
      where: {id, teacherId, status: "composing"},
      data: {status: "proposed", proposalRevision: result.proposalRevision,
        proposalSnapshot: json(result.composition), composedSession: json(result.composedSession)},
    });
    if (changed.count !== 1) throw new Error("Preparation is no longer composing");
  },
  async fail(teacherId, id, code) {
    const changed = await client.preparedLesson.updateMany({where: {id, teacherId, status: "composing"}, data: {status: "failed", failureCode: code}});
    if (changed.count !== 1) throw new Error("Preparation is no longer composing");
  },
};
}

export const preparationStore = createPreparationStore();
