import { displayPhotoAsset, type CastMember } from "./member";
import type { CardConditionState } from "./conditions";

/**
 * The daily summary — what today holds, in one or two short lines.
 *
 * Johan, reviewing the deployed card on his own coordinates: "i dont think the
 * big image here is necessary.. would maybe give like a daily thing.. summary
 * or something". The single-species hero band is gone and this stands in its
 * place.
 *
 * It is a better use of that slot than a photograph was, for a reason worth
 * writing down: the band spent the card's most prominent space on ONE species,
 * which the faces below already showed. The summary spends it on the thing a
 * teacher opened the card to find out — what today actually is.
 *
 * ── IT NAMES THE SESSION, AND THAT IS THE POINT ────────────────────────────
 *
 * Usability I1: all three personas failed to find what today's session was.
 * The session block lives below the card, under the conditions, the faces and
 * the band, which on a phone is below the fold. The summary is its natural
 * home — the first line of the first card now says what the class is doing.
 *
 * ── RESTRAINT STILL GOVERNS ────────────────────────────────────────────────
 *
 * The mild-says-little benchmark is not suspended because a slot opened up. On
 * a fine day with no session and nothing safe to lead with, this returns null
 * and the card renders nothing at all. Two sentences is the ceiling, and the
 * second one has to earn its place: it is dropped before it is padded.
 *
 * Deterministic. No model, no invention — every clause is assembled from a
 * field the card already holds.
 */

export interface DailySummaryQuery {
  /** The day's shape. Null when there was no read at all. */
  state: CardConditionState | null;
  /** Today's session title, when the shelf has one. */
  sessionTitle?: string | null;
  /** Today's cast, in findability order. */
  members: readonly CastMember[];
}

/**
 * The species the summary may point at.
 *
 * SAFETY-FORWARD APPLIES TO PROMINENCE, NOT JUST PRESENCE (#167). The live
 * card put an Oriental Hornet in the "easiest to find near you today" slot,
 * with a photograph the size of the card. A stinging species being ON the card
 * is fine and often right — a class that meets one should know it. Being
 * RECOMMENDED is not: "the easiest to find" is an invitation to go looking,
 * and we do not invite four-year-olds to go looking for a hornet.
 *
 * So anything carrying a safety note is skipped for the lead. It keeps its
 * face, its profile and its calm boundary line; it just never gets pointed at.
 */
export function leadSpecies(members: readonly CastMember[]): CastMember | null {
  return (
    members.find(
      (m) =>
        !m.absent &&
        m.honestyTier === "recorded" &&
        !m.safetyNote &&
        Boolean(displayPhotoAsset(m))
    ) ?? null
  );
}

/**
 * One or two short lines, or null.
 *
 * Order is fixed and is the argument: what the class is doing first, what they
 * might meet second. A teacher at the door reads the first line and stops.
 */
export function dailySummary(query: DailySummaryQuery): string | null {
  const { state, sessionTitle, members } = query;

  // No read at all: the quiet card says its own honest sentence, and a summary
  // on top of it would be the card talking twice about knowing nothing.
  if (state === null) return null;

  const lines: string[] = [];

  const title = sessionTitle?.trim();
  if (title) lines.push(`Today: ${title}.`);

  const lead = leadSpecies(members);
  if (lead) {
    lines.push(`${lead.commonName} was recorded nearby recently.`);
  }

  // Nothing to say. On an ordinary morning with no session and nothing
  // recorded, the card is allowed to skip this entirely.
  if (lines.length === 0) return null;

  return lines.join(" ");
}
