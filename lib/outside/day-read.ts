/**
 * THE READ — this morning, as one sentence (#323).
 *
 * Sophia's direction A: *"Today is a short note about this morning that ends
 * by handing you the lesson it changes."* The note opens with a sentence, not
 * a widget, and the sentence is COMPOSED rather than written: it joins the two
 * clauses `skyPhrase` and `groundPhrase` already return, in the order a person
 * says them.
 *
 * ── WHY THIS IS NOT GENERATION ─────────────────────────────────────────────
 *
 * Every clause below is a lookup on a value the producer returned, and the
 * only judgement the code makes is which SECOND clause to use. No model sits
 * between a teacher and a number she is going to plan around, and there is no
 * clause here for a reading we did not take. That matters more here than
 * anywhere else on the home screen, because prose reads as authored: a
 * sentence that says "since first light" when nobody reported first light is
 * the pond bug in a nicer costume.
 *
 * ── THE SECOND CLAUSE RULE ─────────────────────────────────────────────────
 *
 * Two sentences on an ordinary day, and a third only when the light is short
 * (see `lightSentence`). Within the first, two clauses, never three. She is reading this in glare with a coat in one
 * hand, and the instrument row underneath carries the rest.
 *
 *   ground not dry → the GROUND is the second clause. What a class will be
 *                   standing in is the most actionable fact on this screen:
 *                   wet ground decides whether thirty four-year-olds sit down.
 *   otherwise      → the AIR is the second clause. On a dry day the ground is
 *                   unremarkable and the wind is what she can feel.
 *
 * THIS USED TO KEY ON RAIN, and rain is the wrong question (#341). It is not
 * raining on the morning after it rained, and that is exactly the morning the
 * ground decides the lesson. Keying on the ground's own state also means the
 * word and the state appear on the same days, which is what a drawn mark for
 * the ground would need in order to be legible rather than decorative.
 *
 * ── AND IT DEGRADES BY GETTING SHORTER ─────────────────────────────────────
 *
 * One clause when only one came back. Null when none did, and null renders
 * nothing at all — no skeleton, no "checking outside", no hedge. The lesson
 * simply moves up and the page is shorter.
 */

import type { FieldTruth } from "./pointmoon";
import { lightLeft, type SkyFact } from "./sky";
import { resolveSkyKey, type SkyKey } from "./sky-key";

/**
 * The sky, as the opening of a sentence rather than as a label.
 *
 * The label tables in `lib/cast/conditions` and `lib/outside/conditions` say
 * "a clear sky", which is a noun phrase for a list. A sentence needs a verb,
 * so this is its own table rather than a string transform on theirs: bolting
 * "The sky is " onto "a clear sky" produces "The sky is a clear sky".
 */
const SKY_CLAUSES: Record<SkyKey, string> = {
  clear: "The sky's clear",
  "mostly-clear": "The sky's almost clear",
  "partly-cloudy": "Clouds are drifting over",
  cloudy: "The sky's cloudy",
  overcast: "The sky's a soft grey",
  fog: "There's fog",
  haze: "The air is hazy",
  smoke: "There's smoke in the air",
  snow: "Snow is falling",
  // Reached only when no rate came back; the rate branch below outranks it
  // and says whether the rain is light. Never a second vocabulary for rain.
  rain: "Rain is falling",
};

/**
 * The air, as the second half of the first sentence.
 *
 * THE READINGS ARE DESCRIBED AS BEHAVIOUR RATHER THAN AS STATES, which is most
 * of the difference between our line and the prototype's, and it costs nothing
 * in honesty: "the wind is moving through" says exactly what a wind speed of
 * 24 km/h says, in the words someone standing in it would use. Nothing here
 * describes a pattern nobody measured — there is no "in pulses", no "between
 * the gusts", because the producer returns one wind speed and not a gust
 * profile. That is the line between fuller and invented, and it is where the
 * pond bug lived.
 */
const AIR_CLAUSES: Array<{ atLeastKph: number; clause: string }> = [
  { atLeastKph: 39, clause: "a strong wind is blowing across everything" },
  { atLeastKph: 20, clause: "a fresh wind is moving through" },
  { atLeastKph: 6, clause: "a light breeze is moving" },
  { atLeastKph: 0, clause: "the air is completely still" },
];

/**
 * The ground, AS ITS OWN SENTENCE (#355).
 *
 * Johan: *"the one we had in old proto was better"*. His prototype's read is
 * two sentences — the air, then "Ground's firm and dry underfoot." — and the
 * second sentence is most of why it sounds like someone who went outside
 * rather than a field that got filled in. A clause hanging off "and" is a
 * list; a sentence of its own is a second look.
 *
 * These are whole sentences rather than the clause fragments they replace,
 * because the join is now a full stop. `lib/outside/sky.ts` holds the same six
 * states as label fragments for the instrument row.
 *
 * DRY IS SAID NOW, and it did not used to be. The old rule spent the second
 * clause on the air whenever the ground was dry, on the argument that dry is
 * the absence of a problem. With the ground in a sentence of its own the air
 * is not competing for the slot, and "the ground is dry underfoot" is the
 * single most useful thing this screen tells a teacher deciding whether thirty
 * four-year-olds can sit down.
 */
const GROUND_SENTENCES: Record<string, string> = {
  dry: "The ground is dry underfoot.",
  damp: "The ground is damp underfoot.",
  wet: "The ground is wet underfoot.",
  saturated: "The ground is waterlogged.",
  frozen: "The ground is frozen hard.",
  snow: "There is snow on the ground.",
};

/**
 * HOW LONG THE GROUND HAS BEEN DRY (2026-09-07).
 *
 * Johan, on the shipped read at noon: *"this is so uninformative... we can do
 * better"*. "The ground is dry underfoot" was true and said nothing the mark
 * and the number above it had not already implied on a fine day. What the
 * payload also carries, and nothing on Today read, is
 * `ground.hoursSinceMeaningfulPrecipitation` — the reading that decides
 * whether the soil lesson digs easily and whether the worms are down. Two
 * days is the line `presentConditions` already draws for the pack's `dry`
 * kind, so the sentence and the hinge agree about what a dry spell is.
 *
 * Days, not hours, because "51 hours" is a readout and "two days" is what a
 * person says. Rounded, and past a fortnight said in weeks.
 */
const DRY_SPELL_HOURS = 48;

function drySpell(hours: unknown): string | null {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours < DRY_SPELL_HOURS) return null;
  const days = Math.round(hours / 24);
  if (days >= 14) {
    const weeks = Math.round(days / 7);
    return `${weeks} weeks`;
  }
  return `${days} days`;
}

/**
 * THE LIGHT, WHEN THE LIGHT IS THE DECISION (2026-09-07).
 *
 * `time.windows.daylightMinutesRemaining` used to sit on the instrument row
 * under this sentence; when #355 folded the row into the read, it was
 * dropped rather than carried, so a November Today at half past two said
 * nothing about the fact that decides whether the class goes out at all.
 *
 * It is a THIRD sentence, and it appears only when it changes the plan:
 * under two hours, or gone. At noon in September there are seven hours left
 * and saying so is noise; the two-sentence ceiling holds on every ordinary
 * day. Read straight off the producer's minutes through `lightLeft`, the
 * same words the brief uses.
 */
const LIGHT_WORTH_SAYING_MINUTES = 120;

function lightSentence(data: FieldTruth | null): string | null {
  const minutes = data?.facts?.fieldSnapshot?.time?.windows?.daylightMinutesRemaining;
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes >= LIGHT_WORTH_SAYING_MINUTES) return null;
  const left = lightLeft(data);
  if (!left) return null;
  return left.startsWith("about") ? `${standalone(left)} of light left.` : "The light has gone.";
}

function airClause(windKph: unknown): string | null {
  if (typeof windKph !== "number" || !Number.isFinite(windKph) || windKph < 0) {
    return null;
  }
  return AIR_CLAUSES.find((step) => windKph >= step.atLeastKph)?.clause ?? null;
}

/** Sentence-cases the second clause when it has to lead on its own. */
function standalone(clause: string): string {
  return clause.charAt(0).toUpperCase() + clause.slice(1);
}

/**
 * This morning, in one sentence, or null when nothing came back.
 *
 * Pure. A payload in, a sentence out, and the same payload always gives the
 * same sentence — which is the property that lets a test assert the whole
 * surface instead of asserting that a string is non-empty.
 */
export function dayRead(data: FieldTruth | null): string | null {
  const current = data?.facts?.fieldSnapshot?.weather?.current;
  if (!current) return null;

  const rainRate = current.precipitationRateMmPerHour;
  const raining = typeof rainRate === "number" && rainRate > 0.1;

  // ONE RESOLVER, NOT A LOOKUP ON A RENDER ENUM (#368). `skyCondition` cannot
  // say "partly cloudy" — it collapses 0-84% cloud into `clear`, and this
  // sentence printed "The sky's clear" over a 61%-cloud London sky.
  const skyKey = resolveSkyKey({
    skyCondition: current.skyCondition,
    skyCover: current.skyCover,
    cloudCoverPct: current.cloudCoverPct,
  });
  const sky = skyKey ? SKY_CLAUSES[skyKey] : undefined;

  // Rain outranks the sky word for the opening clause. "The sky's a soft grey
  // and the ground is wet underfoot" buries the one fact that decides whether
  // thirty children put coats on.
  const lead = raining
    ? (rainRate as number) >= 2.5
      ? "Rain is falling"
      : "A light rain is falling"
    : sky ?? null;

  const air = airClause(current.windKph);

  // FIRST SENTENCE: the sky, then the air. Both, whenever both came back —
  // the old rule made them compete for one slot and then usually gave it to
  // the ground, which is how a two-clause read came to be the ceiling.
  const first =
    lead && air ? `${lead} and ${air}.` : lead ? `${lead}.` : air ? `${standalone(air)}.` : null;

  // SECOND SENTENCE: the ground, on its own — and, when it has been dry a
  // while, for how long. Only on dry ground: damp ground two days after rain
  // is a fact about the drainage, not the weather, and the sentence would be
  // guessing at which.
  const ground = data?.facts?.fieldSnapshot?.ground;
  const groundState = typeof ground?.state === "string" ? ground.state.trim() : null;
  const groundSentence = groundState ? GROUND_SENTENCES[groundState] ?? null : null;
  const spell = groundState === "dry" ? drySpell(ground?.hoursSinceMeaningfulPrecipitation) : null;
  const second =
    groundSentence && spell
      ? `${groundSentence.slice(0, -1)} after ${spell} without rain.`
      : groundSentence;

  // THIRD SENTENCE, RARELY: the light, when there is little of it left.
  const third = lightSentence(data);

  // AND IT STILL DEGRADES BY GETTING SHORTER. One sentence when only one came
  // back, null when none did, and null renders nothing at all — no skeleton,
  // no hedge. The page is simply shorter.
  const read = [first, second, third].filter(Boolean).join(" ");
  return read.length > 0 ? read : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE INSTRUMENT ROW — the numbers the sentence does not carry.
 *
 * A sentence is slower to read in glare than a number, and she is often only
 * checking one thing, so the readings survive under the read. What they must
 * not do is repeat it: "The sky is clear and there is a light breeze" followed
 * by "a clear sky · a light breeze" is the same fact twice, and a screen that
 * says everything twice is the crammed screen this rebuild is answering.
 *
 * So the split is by OWNER. The sentence owns the sky and the air. The row
 * owns the temperature, the ground, and the clock.
 *
 * TWO ROWS, because they answer two questions: what is it like out there, and
 * how long have I got.
 *
 * AND THE LABELS ARE NOT UNIFORM, because the values are not. `skyFacts`
 * returns label-and-value pairs for an instrument list, and printing every one
 * as "label value" produces "light left the light has gone" and "ground dry
 * underfoot". A value that is already a phrase reads on its own; a bare clock
 * time does not. That judgement belongs here, next to the row that renders it.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Facts whose value already says what it is. A label would be a stammer. */
const SELF_DESCRIBING = new Set(["moon", "ground"]);

function reading(fact: SkyFact): string {
  if (SELF_DESCRIBING.has(fact.label)) return fact.value;
  // "about 35 minutes" needs saying what OF; "the light has gone" does not.
  if (fact.label === "light left") {
    return fact.value.startsWith("about") ? `${fact.value} of light left` : fact.value;
  }
  return `${fact.label} ${fact.value}`;
}

/**
 * The two instrument rows, each already joined. An empty row is omitted rather
 * than rendered blank, and with nothing to report there are no rows at all.
 */
export function instrumentRows({
  temperature,
  facts,
}: {
  temperature: string | null;
  facts: readonly SkyFact[];
}): string[] {
  const ground = facts.find((fact) => fact.label === "ground");
  const here = [temperature, ground?.value].filter((part): part is string => Boolean(part));

  const clock = facts
    .filter((fact) => fact.label !== "ground")
    .map(reading);

  return [here.join(" · "), clock.join(" · ")].filter((row) => row.length > 0);
}
