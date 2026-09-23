import { z } from "zod";
import { extractWorldFacts, isModelAvailable } from "@/lib/ai/plate-draft";
import { guardAiRoute, privateJson } from "@/lib/ai/api-guard";
import { MAX_INPUT_LEN } from "@/lib/ai/world-extract-contract";

export const dynamic = "force-dynamic";

const requestSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(MAX_INPUT_LEN)
      .refine((value) => !/[<>]/.test(value) && !/https?:\/\//i.test(value)),
  })
  .strict();

/**
 * #280 · The onboarding assistant's extraction endpoint. A teacher's
 * free-form paragraph about her own grounds goes in; candidate place facts
 * come back, each tied to the words that produced it. Nothing is written to
 * the database here — this route only drafts. The teacher confirms or
 * rejects each candidate in the client (`app/WorldBuilder.tsx`), and only
 * what she confirms is ever persisted, through the same `setWorld` /
 * `WorldForm` write path the pill-and-note form already used, plus a
 * provenance row (`recordWorldFactDecisions` in `app/worldChatActions.ts`).
 *
 * Extends the AI boundary `/api/lesson-support` already runs, rather than
 * opening a second one: authed, rate-limited per teacher (shared ledger —
 * a teacher's onboarding chat and her in-lesson helper taps share one
 * budget), cross-site blocked, closed to caching. `lib/ai/api-guard.ts` is
 * that shared boundary, factored out of `/api/lesson-support` for this.
 *
 * Deliberately NOT shaped as a new task on `lessonSupportTasks`: that enum
 * and its route are keyed on a `sessionId` and everything downstream reads a
 * lesson session, a phase, and a class's location to ground a teaching
 * overlay. This call has none of that — it is one paragraph about a place,
 * asked before any class row need exist to answer it — so bending it into
 * that shape would mean either faking a session or forking the route's
 * control flow on task. Reusing the boundary and forking the door felt more
 * honest than reusing the door and forking the boundary.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;
  if (!isModelAvailable()) return privateJson({ available: false, draft: null });

  let candidate: unknown;
  try {
    candidate = await request.json();
  } catch {
    return privateJson({ error: "invalid-json" }, 400);
  }
  const parsed = requestSchema.safeParse(candidate);
  if (!parsed.success) return privateJson({ error: "invalid-request" }, 400);

  const draft = await extractWorldFacts(parsed.data.text);
  return privateJson({ available: true, draft });
}
