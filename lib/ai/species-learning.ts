import { createHash } from "node:crypto";
import type { SpeciesLearning } from "@/lib/cast/species-learning";
import { draft, outcomeCode } from "./draft";
import { isModelAvailable } from "./model";
import { loadPrompt } from "./prompt-registry";
import { CHILD_LIMITS, parseChildLearning, type SpeciesNoteInput } from "./species-note";

const cache = new Map<string, SpeciesLearning>();
const inFlight = new Map<string, Promise<SpeciesLearning | null>>();

/** Child words have their own validation and cache. An adult-note refusal must
 * never erase a supported introduction. Misses are retryable; concurrent taps
 * share one request and the authenticated route enforces the request limit. */
export async function draftSpeciesLearning(input: SpeciesNoteInput): Promise<SpeciesLearning | null> {
  if (!isModelAvailable() || !input.source.text.trim()) return null;
  const key = createHash("sha256").update(JSON.stringify([input.scientificName, input.commonName, input.source.text])).digest("hex");
  const held = cache.get(key);
  if (held) return held;
  const pending = inFlight.get(key);
  if (pending) return pending;
  // The model selects evidence; it does not have to transcribe a quotation.
  // Build this table once so generation and validation use identical passages.
  const passages = Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(input.source.text))
    .map(({ segment }) => segment.trim())
    .filter((text) => text.length >= 12 && text.length <= 360)
    .map((text, index) => ({ id: `s${index + 1}`, text }));
  if (!passages.length) return null;
  const prompt = loadPrompt("species-learning", {
    childWords: String(CHILD_LIMITS.words - 5),
    childChars: String(CHILD_LIMITS.chars - 20),
  });
  if (!prompt) return null;
  const work = draft({
    prompt: { ...prompt, user: `The species: ${input.commonName}\n\nSource passages:\n${JSON.stringify(passages)}` },
    facts: { input, passages },
    maxTokens: 700,
    parse: (json, facts) => {
      const fields = json && typeof json === "object" ? json as Record<string, unknown> : {};
      const resolved = Object.fromEntries((["introduction", "lookFor", "question"] as const).map((key) => {
        const field = fields[key];
        if (!field || typeof field !== "object") return [key, null];
        const { text, evidenceId } = field as Record<string, unknown>;
        const passage = typeof evidenceId === "string" ? facts.passages.find(({ id }) => id === evidenceId) : undefined;
        return [key, passage ? { text, evidence: passage.text } : null];
      }));
      return parseChildLearning(resolved, facts.input, (reason) => {
        // A fixed category, never source text or generated words.
        console.warn("[species-learning] introduction-rejected", outcomeCode(reason));
      });
    },
  }).then((value) => {
    if (value) {
      if (cache.size >= 128) cache.delete(cache.keys().next().value!);
      cache.set(key, value);
    }
    if (!value) console.warn("[species-learning] draft-unavailable");
    return value;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}
