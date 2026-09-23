import { preparedForNotice, sourceSinceLine } from "@/lib/prepared-day/prepared-for";
import type { ContextRevision } from "@/schema/prepared-day";

/**
 * The lines that say what this sheet was prepared for (#1092).
 *
 * It sits in the sheet's own header beside the sample-patch label, because the
 * two answer the same question about the same piece of paper: this was made
 * for somewhere, and it was made for a time and a sky. Both are silent on a
 * sheet printed straight from the authored pack, which was prepared for
 * nothing in particular and must not claim otherwise.
 *
 * The sentences are built in `lib/prepared-day/prepared-for.ts` and rendered
 * here unchanged. Nothing is coalesced: when no weather was read, the line the
 * library returns says so, and this component has no sentence of its own to
 * put in its place.
 *
 * `freshness` is the store's own answer about whether the authored lesson has
 * moved since; a fresh one renders nothing, because nothing has changed.
 */
export function PreparedFor({
  context,
  freshness,
}: {
  context: ContextRevision;
  freshness?: "fresh" | "stale" | "source-unavailable";
}) {
  const notice = preparedForNotice(context);
  const since = sourceSinceLine(freshness);
  return (
    <>
      <p className="print-prepared-for">
        {notice.preparedForLine} {notice.conditionsLine}
      </p>
      {since && <p className="print-prepared-for">{since}</p>}
    </>
  );
}
