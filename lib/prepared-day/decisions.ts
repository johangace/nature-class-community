import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type PreparationDecision } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { contextRevisionSchema, decisionRecordSchema, type ContextRevision } from "@/schema/prepared-day";
import { revisionOf } from "./snapshot";

const dismissalSchema = z.object({
  preparedId: z.string().min(1), requestKey: z.string().min(1), decidedRevision: z.string().min(1),
  reasonCode: z.enum(["dismissed-materials-missing", "dismissed-not-right-today", "dismissed-prefer-authored", "rejected-unsupported-claim", "rejected-safety-line-changed"]),
  note: z.string().nullable().default(null),
}).strict();

function event(row: PreparationDecision) {
  return decisionRecordSchema.parse({
    preparedId: row.preparedId, decision: row.decision, reasonCode: row.reasonCode,
    note: row.note, actorRole: "teacher", decidedRevision: row.decidedRevision,
    decidedAt: row.createdAt.toISOString(), recordedAt: row.createdAt.toISOString(),
  });
}

const DIMENSIONS = ["placeKey.value", "ability.band", "weather.conditionKind", "jurisdiction"] as const;
function valueAt(value: unknown, path: string): unknown {
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
/** Context relevance, never a quality score. Unknown values are not matches. */
export function matchingDecisionDimensions(previous: ContextRevision, current: ContextRevision): string[] {
  return DIMENSIONS.filter(path => {
    if (path === "placeKey.value" && previous.placeKey.resolution !== current.placeKey.resolution) return false;
    const a = valueAt(previous, path), b = valueAt(current, path);
    return a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "" && revisionOf(a) === revisionOf(b);
  });
}

export function createDecisionLedger(client: PrismaClient = prisma) {
 return {
  /** The only currently implemented decision transition. Accept/edit/withdraw
   * need their actual state mutation in #1091, not an arbitrary audit append. */
  async dismiss(teacherId: string, raw: unknown) {
    if (!teacherId) throw new Error("Decision requires an owner");
    const input = dismissalSchema.parse(raw);
    const payloadHash = revisionOf(input);
    return client.$transaction(async tx => {
      // Hold ownership/revision stable through the append. A concurrent editor
      // must finish before this check or wait until this decision commits.
      const owned = await tx.$queryRaw<Array<{id: string}>>`
        SELECT "id" FROM "prepared_lesson"
        WHERE "id" = ${input.preparedId} AND "teacherId" = ${teacherId} FOR UPDATE`;
      if (!owned.length) throw new Error("Preparation not found");
      const previous = await tx.preparationDecision.findUnique({where: {preparedId_requestKey: {preparedId: input.preparedId, requestKey: input.requestKey}}});
      if (previous) {
        if (previous.payloadHash !== payloadHash) throw new Error("Decision key already names a different decision");
        return event(previous);
      }
      const preparation = await tx.preparedLesson.findUniqueOrThrow({where: {id: input.preparedId}});
      if (preparation.status !== "proposed" || preparation.proposalRevision !== input.decidedRevision) throw new Error("Decision revision is no longer the proposal reviewed");
      const now = new Date();
      const note = input.note === null ? Prisma.DbNull : {body: input.note, delimiter: "teacher-decision-note", enteredBy: "teacher", enteredAt: now.toISOString()};
      const saved = await tx.preparationDecision.create({data: {
        id: randomUUID(), preparedId: input.preparedId, requestKey: input.requestKey,
        payloadHash, decision: "dismissed", reasonCode: input.reasonCode,
        decidedRevision: input.decidedRevision, note, createdAt: now,
      }});
      return event(saved);
    });
  },
  async forLesson(teacherId: string, sessionId: string, current?: ContextRevision, limit = 10) {
    if (!teacherId || !sessionId) throw new Error("Decision retrieval requires an owner and lesson");
    const count = z.number().int().min(1).max(50).parse(limit);
    const context = current ? contextRevisionSchema.parse(current) : undefined;
    // Exclude ALL evaluation/test data before ranking or limiting. No caller
    // flag can admit held-out examples to production composer retrieval.
    const rows = await client.preparationDecision.findMany({
      where: {preparation: {teacherId, sessionId, usageClass: "production"}},
      include: {preparation: {select: {contextSnapshot: true}}},
      orderBy: [{createdAt: "desc"}, {id: "desc"}], take: 200,
    });
    return rows.map(row => ({decision: event(row), matchingDimensions: context
      ? matchingDecisionDimensions(contextRevisionSchema.parse(row.preparation.contextSnapshot), context) : []}))
      .sort((a, b) => b.matchingDimensions.length - a.matchingDimensions.length)
      .slice(0, count);
  },
 };
}
export const decisionLedger = createDecisionLedger();
