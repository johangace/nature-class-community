import type { ConditionKind } from "@/schema/pack";
import type { FieldTruth } from "./pointmoon";

/**
 * The day's coarse shape, read from one Pointmoon field-truth payload.
 *
 * This used to live in lib/grounding.ts, which imports the model layer and the
 * whole outside composer. It is pure — a payload in, a word out — and three
 * different things now depend on it (the grounded line's cache key, the
 * runner's variant suggestion, and the daily card's condition state), so it
 * sits on its own where any of them can read it and a unit test can import it
 * without booting an AI client. lib/grounding re-exports it unchanged.
 *
 * Precedence is deliberate and is the thing the tests pin: RAIN outranks
 * everything, because rain changes the outing more than temperature does;
 * then a genuinely strong wind; then the temperature extremes; then mild. A
 * warm, wet morning is a wet day. A hot, breezy one is a hot day.
 */
export type ConditionsBucket = "wet" | "windy" | "cold" | "hot" | "mild";

export function conditionsBucket(data: FieldTruth | null): ConditionsBucket | null {
  const current = data?.facts?.fieldSnapshot?.weather?.current;
  if (!current) return null;
  const rain = current.precipitationRateMmPerHour;
  if (typeof rain === "number" && rain > 0.1) return "wet";
  const wind = current.windKph;
  if (typeof wind === "number" && wind >= 39) return "windy";
  const apparentC = current.felt?.apparentC;
  if (typeof apparentC === "number" && Number.isFinite(apparentC)) {
    if (apparentC <= 6) return "cold";
    if (apparentC >= 26) return "hot";
  }
  return "mild";
}

/**
 * EVERY CONDITION TRUE OF THIS MOMENT, in the pack's vocabulary (#1007).
 *
 * `conditionsBucket` collapses the day to ONE word by precedence, which is
 * right for a cache key and a toggle default. A hinge needs more: a warm,
 * still, bright morning is three true things, and the minibeast lesson's line
 * is about the still one. So this returns the set, primary first, each read
 * off the field the word names and nothing composed:
 *
 *   wet     precipitationRateMmPerHour > 0.1
 *   windy   windKph >= 39
 *   cold    felt.apparentC <= 6
 *   hot     felt.apparentC >= 26
 *   dry     ground.hoursSinceMeaningfulPrecipitation >= 48, and not wet
 *   still   windKph < 5, and not wet
 *   bright  cloudCoverPct <= 30, or skyCover/skyCondition clear, and not wet
 *
 * A missing field never asserts its kind: no ground reading means not "dry",
 * not "unknown-dry". Null when there is no weather at all.
 */
export function presentConditions(data: FieldTruth | null): ConditionKind[] {
  const snapshot = data?.facts?.fieldSnapshot;
  const current = snapshot?.weather?.current;
  if (!current) return [];
  const present: ConditionKind[] = [];
  const primary = suggestedCondition(conditionsBucket(data));
  if (primary) present.push(primary);
  const wet = primary === "wet";
  const hours = snapshot?.ground?.hoursSinceMeaningfulPrecipitation;
  if (!wet && typeof hours === "number" && hours >= 48) present.push("dry");
  const wind = current.windKph;
  if (!wet && typeof wind === "number" && wind < 5) present.push("still");
  const cloud = current.cloudCoverPct;
  const skyWord = String(current.skyCover ?? current.skyCondition ?? "").toLowerCase();
  const bright =
    (typeof cloud === "number" && Number.isFinite(cloud) && cloud <= 30) ||
    (cloud == null && (skyWord === "clear" || skyWord === "mostly-clear"));
  if (!wet && bright) present.push("bright");
  return present;
}

/** The bucket, spoken in the runner's variant vocabulary — the seed for the
 * wet/dry/windy toggle's default (#145; the toggle itself stays manual). A
 * mild day suggests nothing: the base plan holds. */
export function suggestedCondition(bucket: ConditionsBucket | null): ConditionKind | null {
  switch (bucket) {
    case "wet":
      return "wet";
    case "windy":
      return "windy";
    case "cold":
      return "cold";
    case "hot":
      return "hot";
    default:
      return null;
  }
}
