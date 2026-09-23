import { getSession, loadPack } from "@/lib/pack";

/** Public-facing name for the existing counting-life experience; authored narration is unchanged. */
const session = getSession(loadPack("summer"), "summer-w1-counting-life");
const opening = session.phases.flatMap((phase) => phase.blocks).find((block) => block.type === "say-aloud");
export const landingLesson = {
  id: session.id,
  title: "Life detectives",
  durationMin: session.durationMin,
  question: session.prompt,
  topic: session.topic,
  namedSkill: session.namedSkill,
  excerpt: opening?.type === "say-aloud" ? opening.text : session.topic,
} as const;

/** A complete authored phase for the small script view on the landing. */
export const landingScriptPhase = session.phases.find((phase) => phase.key === "see-2")!;
