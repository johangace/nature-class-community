import type { Block, Phase, Session } from "@/schema/pack";

/**
 * Freeze a grounded conditions line into a session before its run begins.
 *
 * The conditions block ships with an authored `fallbackText` — a line true of
 * any day anywhere, which is exactly the complaint: "either make it contextual
 * for the day and place or remove". A grounded line composed from today's
 * verified facts already exists; substituting it HERE, on the server, before
 * the runner receives the session, is what makes it safe to use. The renderer's
 * standing law is that a client must never replace a sentence while a teacher
 * is reading it aloud, and a line frozen before the run starts never does.
 *
 * When there is no grounded line — no location, no facts, a failed read — the
 * authored line stands untouched. Nothing else in the session is altered: the
 * ability variants, every other block, and the phase order are the author's.
 */
export function groundSessionConditions(session: Session, line: string | null): Session {
  const grounded = line?.trim();
  if (!grounded) return session;

  const groundBlock = (block: Block): Block => {
    if (block.type !== "conditions-line") return block;
    // An author who wrote a Reception line and a Year 2 line asked for two
    // bands, and one grounded sentence cannot honour both. Where variants
    // exist the authored block stands whole; where they do not, today's line
    // replaces the generic one. Grounding never costs a class its reading
    // level. (The alternative — composing the grounded line per band — is
    // the better answer and needs the band at the grounding call: #246.)
    if (block.abilityVariants) return block;
    return { ...block, fallbackText: grounded };
  };

  const groundPhase = (phase: Phase): Phase => ({
    ...phase,
    blocks: phase.blocks.map(groundBlock),
    ...(phase.conditionVariants
      ? {
          conditionVariants: phase.conditionVariants.map((variant) => ({
            ...variant,
            phase: {
              ...variant.phase,
              blocks: variant.phase.blocks.map(groundBlock),
            },
          })),
        }
      : {}),
  });

  return { ...session, phases: session.phases.map(groundPhase) };
}
