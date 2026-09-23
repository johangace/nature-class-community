"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getTeacher } from "@/lib/teacher";
import { WORLD_FACT_KINDS } from "@/lib/ai/world-extract-contract";

/**
 * The onboarding assistant's provenance ledger (#280): what the model read
 * from one paragraph, and what the teacher actually decided about each
 * candidate — confirmed or rejected.
 *
 * This action does NOT touch `Class.siteFeatures`, `siteNotes`, or `reach`.
 * A confirmed candidate is folded into `WorldBuilder`'s own local answer
 * exactly as a manual pill tap or typed note already is, and reaches the
 * class row through the existing `setWorld` write path
 * (`app/start/actions.ts`) when she saves — one merge rule, the one that
 * already exists, not a second copy of it living here. This action only
 * ever writes the ledger itself: what was proposed, the exact words it came
 * from, how sure the model was, and what she decided — so a teacher-stated,
 * chat-confirmed fact stays traceable to its source even after it has been
 * folded into the plain columns everything else reads.
 *
 * Best-effort and silent on failure, the same posture `setGrounds` and
 * `setWorld` already take: a ledger write failing costs history, never her
 * place in the flow she is standing in.
 */

const decisionSchema = z.object({
  kind: z.enum(WORLD_FACT_KINDS),
  value: z.string().trim().min(1).max(200),
  quote: z.string().trim().min(1).max(200),
  confidence: z.number().min(0).max(1),
  status: z.enum(["confirmed", "rejected"]),
  /**
   * Where the candidate came from (#377). "teacher-stated" is her own words
   * through the chat, and stays the default; "teacher-photographed" is a fact
   * she confirmed off her own photograph — she stood there and pointed a
   * camera, which the ledger records apart so the two render honestly apart.
   * The photograph itself is never stored; only this label survives it.
   */
  provenance: z.enum(["teacher-stated", "teacher-photographed"]).default("teacher-stated"),
});

const inputSchema = z.object({
  classId: z.string().min(1),
  decisions: z.array(decisionSchema).min(1).max(20),
});

export type WorldFactDecision = z.infer<typeof decisionSchema>;

export async function recordWorldFactDecisions(
  classId: string,
  decisions: WorldFactDecision[]
): Promise<void> {
  try {
    const teacher = await getTeacher();
    if (!teacher) return;

    const parsed = inputSchema.safeParse({ classId, decisions });
    if (!parsed.success) return;

    // Ownership-scoped, same as every other class write in this flow: a
    // ledger entry can only ever be written against the signed-in teacher's
    // own class.
    const owned = await prisma.class.findFirst({
      where: { id: parsed.data.classId, teacherId: teacher.id },
      select: { id: true },
    });
    if (!owned) return;

    await prisma.worldFact.createMany({
      data: parsed.data.decisions.map((decision) => ({
        classId: owned.id,
        kind: decision.kind,
        value: decision.value,
        sourceText: decision.quote,
        confidence: decision.confidence,
        status: decision.status,
        provenance: decision.provenance,
        decidedAt: new Date(),
      })),
    });
  } catch {
    // The ledger watches the flow; it must never interrupt it.
  }
}
