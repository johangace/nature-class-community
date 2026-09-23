import { availableConditions } from "@/lib/resolve";
import type { Block, ConditionKind, Phase, Session } from "@/schema/pack";

/**
 * SAY THE CONDITIONS ONCE (#270).
 *
 * `groundSessionConditions` freezes ONE grounded sentence into the session
 * before the run starts, and it writes that one sentence into EVERY
 * groundable `conditions-line` block. Four of the shipped autumn-starter
 * sessions author two of those blocks — one in `settle`, one in the body
 * phase after it — with two different authored lines. Grounding collapses
 * both to the same string, so the teacher reads
 *
 *   "Right now it feels like 24 degrees out under a soft grey sky…"
 *
 * verbatim a second time, minutes later, live in front of a class. The
 * mechanism is working as designed; the reading is not. On the old paged
 * runner she only ever had one phase on screen, so the repeat was invisible.
 *
 * This module is the whole of the fix, and it is pure mechanism: it removes a
 * conditions-line whose sentence has ALREADY been said in the same walk, and
 * removes nothing else. No new words, no rephrasing, no pack edit.
 *
 * THE FIRST OCCURRENCE IS THE ONE THAT SURVIVES. "Right now" is true when the
 * lesson starts; the earliest phase is where it is worth saying.
 *
 * NO WINDOW, AND THE NUMBER IS THE REASON. The ticket offered "suppress a
 * repeat within N phases". There is no N to defend: the sentence is frozen
 * ONCE for the whole run, so it never becomes new information later in the
 * walk — and in every shipped session that has two of these blocks the pair
 * sits in ADJACENT phases (0 → 1, four times out of four), so any N ≥ 1 would
 * behave identically on all real data. A threshold with no observable effect
 * is a number nobody could ever justify by evidence. So the rule is the whole
 * walk, and it is stated rather than tuned.
 *
 * IDENTICAL MEANS IDENTICAL ON THE PAGE, NOT IDENTICAL IN THE PACK. Two blocks
 * are the same only when every band and every pack key would read the same
 * sentence off both (see `sentenceSignature`). A conditions-line that carries
 * genuinely different content — an ungrounded one holding its authored line,
 * an ability-variant block grounding skipped — is left exactly where the
 * author put it. An honest suppression removes a byte-for-byte repeat and
 * nothing more.
 *
 * EVERY BAND, not the band on screen, and that is deliberate. The legacy
 * runner carries an ability-band toggle a teacher can reach mid-lesson
 * (`lib/ability.ts`), so the session handed to the client has to be right for
 * whichever band she lands on — a block dropped because it matched under Year
 * 1 would blank Reception's own line the moment she switched. The named cost:
 * two blocks sharing a fallback where only one carries a Reception variant
 * still read the same to a Year 1 class and both survive. No shipped pack
 * writes that shape, and the alternative is a run whose words depend on a
 * control the teacher has not touched yet.
 *
 * ONE WALK IS ONE VIEW. A phase's `conditionVariants` are ALTERNATES: the base
 * phase and its rain variant are never on screen together, so a line in the
 * variant is not a repeat of a line in the base it replaces. Each condition is
 * therefore walked separately and an occurrence is dropped only when it is a
 * repeat in EVERY walk that contains it. No pack authors a conditions-line
 * inside a variant today; this is what keeps that from becoming a silent
 * content loss the day one does.
 */

/**
 * What a conditions-line would read as, for every reader at once.
 *
 * The rendered sentence is `abilityVariants?.[band] ?? fallbackText`
 * (`lib/text.ts`), and `habitatVariants` rides along untouched on this block
 * type. Two blocks agreeing on all three read the same for every band and
 * every pack key; that — not object identity, and not the authored source —
 * is what makes one of them a repeat.
 */
function sentenceSignature(block: Extract<Block, { type: "conditions-line" }>): string {
  const variants = block.abilityVariants
    ? Object.entries(block.abilityVariants).sort(([a], [b]) => a.localeCompare(b))
    : null;
  const habitats = block.habitatVariants
    ? Object.entries(block.habitatVariants).sort(([a], [b]) => a.localeCompare(b))
    : null;
  return JSON.stringify([block.fallbackText, variants, habitats]);
}

/** Where one conditions-line lives: phase index, which alternate, position. */
function positionKey(phaseIndex: number, when: string, blockIndex: number): string {
  return `${phaseIndex}|${when}|${blockIndex}`;
}

/** The blocks a walk actually reads for this phase, and which alternate they are. */
function walkedPhase(phase: Phase, condition: ConditionKind | null): { blocks: Block[]; when: string } {
  const variant = condition
    ? phase.conditionVariants?.find((candidate) => candidate.when === condition)
    : undefined;
  return variant ? { blocks: variant.phase.blocks, when: variant.when } : { blocks: phase.blocks, when: "" };
}

export function sayConditionsOnce(session: Session): Session {
  // Every view the teacher can be looking at: the plan as written, and each
  // weather the pack has alternates for.
  const walks: Array<ConditionKind | null> = [null, ...availableConditions(session)];

  /** Position → is this a repeat in EVERY walk that reaches it? */
  const repeated = new Map<string, boolean>();

  for (const condition of walks) {
    const said = new Set<string>();
    session.phases.forEach((phase, phaseIndex) => {
      const { blocks, when } = walkedPhase(phase, condition);
      blocks.forEach((block, blockIndex) => {
        if (block.type !== "conditions-line") return;
        const signature = sentenceSignature(block);
        const key = positionKey(phaseIndex, when, blockIndex);
        repeated.set(key, (repeated.get(key) ?? true) && said.has(signature));
        said.add(signature);
      });
    });
  }

  if (![...repeated.values()].some(Boolean)) return session;

  const keep = (phaseIndex: number, when: string) => (block: Block, blockIndex: number) =>
    block.type !== "conditions-line" || !repeated.get(positionKey(phaseIndex, when, blockIndex));

  return {
    ...session,
    phases: session.phases.map((phase, phaseIndex) => ({
      ...phase,
      blocks: phase.blocks.filter(keep(phaseIndex, "")),
      ...(phase.conditionVariants
        ? {
            conditionVariants: phase.conditionVariants.map((variant) => ({
              ...variant,
              phase: {
                ...variant.phase,
                blocks: variant.phase.blocks.filter(keep(phaseIndex, variant.when)),
              },
            })),
          }
        : {}),
    })),
  };
}
