import { DandelionTransition } from "../DandelionTransition";

/**
 * The runner's route loading boundary (#355, #634).
 *
 * This handles genuinely slow server navigation. `template.tsx` handles the
 * equally important warm/prefetched case, when Next has no reason to paint a
 * Suspense fallback at all. The runner's client-side preparation continues to
 * use `RunHold`; it is a separate state after the lesson route has opened.
 */
export default function RunLoading() {
  return <DandelionTransition message="Opening the lesson." />;
}
