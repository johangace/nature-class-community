import { requestLocale } from "@/lib/request-locale";
import { z } from "zod";
import { draftAskAnotherWay, isModelAvailable } from "@/lib/ai/plate-draft";
import { askAnotherWayOptions } from "@/lib/ai/ask-another-way-contract";
import { guardAiRoute, privateJson } from "@/lib/ai/api-guard";
import { abilityLabels } from "@/lib/ability";
import { localizeDeep, localizeText } from "@/lib/localization";
import { findSession } from "@/lib/pack";
import { placeContextFor, sessionForPlace } from "@/lib/place-context";
import { getActiveClass } from "@/lib/teacher";
import { resolveText, spokenLine } from "@/lib/text";
import { abilityBands } from "@/schema/pack";

export const dynamic = "force-dynamic";

/**
 * #390 · Ask it another way.
 *
 * THE REQUEST CARRIES NO QUESTION TEXT, and that is the design rather than an
 * economy. The client sends WHICH question — session, phase, index — and this
 * route reads the words out of the authored pack. Two things fall out of it
 * that a text field could not give:
 *
 *   - a second tap rephrases the ORIGINAL, never the first rephrasing. There
 *     is no drift chain because there is nothing for a chain to be made of
 *   - there is still no free text outdoors. The teacher picks an axis from a
 *     fixed row and nothing she types reaches a model
 *
 * It reuses `guardAiRoute` rather than opening a second door with its own
 * slightly different checks, exactly as `/api/world-intake` does (#280).
 */

const requestSchema = z
  .object({
    sessionId: z.string().min(1).max(120),
    phaseKey: z.string().min(1).max(120),
    /** Which circle question on that phase, in the order the plate renders. */
    questionIndex: z.number().int().min(0).max(40),
    option: z.enum(askAnotherWayOptions),
    ability: z.enum(abilityBands).optional(),
    locale: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;
  const { teacher } = guard;
  if (!isModelAvailable()) return privateJson({ available: false, question: null });

  let candidate: unknown;
  try {
    candidate = await request.json();
  } catch {
    return privateJson({ error: "invalid-json" }, 400);
  }
  const parsed = requestSchema.safeParse(candidate);
  if (!parsed.success) return privateJson({ error: "invalid-request" }, 400);

  const found = findSession(parsed.data.sessionId);
  if (!found) return privateJson({ error: "session-not-found" }, 404);

  const active = await getActiveClass(teacher.id);
  const location =
    active && typeof active.lat === "number" && typeof active.lng === "number"
      ? { lat: active.lat, lng: active.lng }
      : null;
  const locale = await requestLocale(parsed.data.locale, location, active?.englishLocale ?? null);

  // The same two passes `/run` makes before it renders a word: the habitat
  // seam picks this school's sentence, localization puts it into the reader's
  // English. Without them the model would be handed a question that is not
  // the one on her plate, and "rephrases the SAME question" would be a claim
  // about a different sentence.
  const placed = localizeDeep(
    await sessionForPlace(
      found.session,
      placeContextFor({
        lat: active?.lat ?? null,
        lng: active?.lng ?? null,
        climate: active?.climate ?? null,
      })
    ),
    locale
  );

  const phase = placed.phases.find((p) => p.key === parsed.data.phaseKey);
  if (!phase) return privateJson({ error: "phase-not-found" }, 404);

  const questions = phase.blocks.filter((block) => block.type === "circle-question");
  const block = questions[parsed.data.questionIndex];
  if (!block) return privateJson({ error: "question-not-found" }, 404);

  // Resolved through the same ability variant and the same quote-unwrapping
  // the plate renders, so the model reads what the teacher reads. A request
  // that omits the band therefore resolves to the BASE text (#860), because
  // that is what an unbanded run is showing: this used to read `?? "y1"`,
  // justified by the runner's own default, and when that default went the
  // fallback had to go with it or the model would rephrase wording the
  // teacher's plate never had on it.
  const ability = parsed.data.ability;
  const question = spokenLine(resolveText(block.text, block.abilityVariants, ability));

  const draft = await draftAskAnotherWay({
    option: parsed.data.option,
    question,
    objective: placed.objective,
    ageBand: (ability ? abilityLabels[ability] : null) ?? active?.yearGroup ?? null,
  });

  // The rephrasing goes back through the seam the original came through
  // (#393). The source question above was localized before the model saw it;
  // a draft returned raw would put "minibeasts" in the mouth of a teacher
  // whose plate says "bugs", one tap apart. After the guard, so the guard
  // still checks what the model actually wrote.
  return privateJson({
    available: true,
    question: draft === null ? null : localizeText(draft, locale),
  });
}
