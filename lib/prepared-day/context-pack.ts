import { sessionDependencies } from "@/lib/content/dependencies";
import { contextFields, nodeTextFields, revisionOf, snapshotInput, type PreparationInput } from "./snapshot";

/** Data assembly only. No prompt, provider call, live lookup or inferred facts.
 * Call from the durable composer with its saved input, not a current class row.
 * Author notes, condition alternatives and lesson intent remain in the complete
 * source; source identity never comes from matching titles or similar prose.
 */
export function buildComposerContext(input: PreparationInput) {
  const snapshot = snapshotInput(input);
  const pack = {
    version: "composer-context.v1" as const,
    sourceRevision: revisionOf(snapshot.source),
    contextRevision: snapshot.context.revisionId,
    source: snapshot.source,
    context: snapshot.context,
    dependencies: sessionDependencies(snapshot.source),
    targets: [...nodeTextFields(snapshot.source).values()].map(({nid, field, text}) => ({nid, field, text})),
    contextFacts: [...contextFields(snapshot.context)].map(([field, value]) => ({
      value,
      origin: {contextRevision: snapshot.context.revisionId, field, valueRevision: revisionOf(value)},
    })),
  };
  return {...pack, revision: revisionOf(pack)};
}
