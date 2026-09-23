import Link from "next/link";
import { CastFace } from "./CastFace";
import { KindIcon } from "@/engine/icons";
import type { DailyCardData } from "@/lib/cast/card";
import { localizeText, type Locale } from "@/lib/localization";
import {
  SEEN_CAPTION,
  USUALLY_AROUND_CAPTION,
} from "@/lib/outside/captions";

/**
 * The daily card — the door.
 *
 * The first surface a teacher meets each morning, and the one that decides
 * whether thirty children go outside. It reports the situation in her
 * register: how it feels out, the one adjustment worth making, two or three
 * calm faces of what she might meet, and, when the day has earned it, one real
 * photograph of the most findable thing out there.
 *
 * ── THE MILD DAY IS THE BENCHMARK ──────────────────────────────────────────
 *
 * Five condition states, and the whole system rests on the quiet one. On an
 * ordinary fine day this card has NO tint, NO adjustment line, NO summary,
 * and two faces instead of three. It says almost nothing.
 *
 * That restraint is not politeness, it is the reason the loud states work. A
 * card that speaks on an ordinary Tuesday has no register left for the
 * thirty-seven degree Tuesday, and a teacher who has learned that the card
 * always says something has learned to stop reading it. If the hot card does
 * not look visibly busier than a mild card sitting beside it, this component
 * has been built wrong.
 *
 * ── AND THE EMPTY CARD IS THE PRIMARY STATE ────────────────────────────────
 *
 * Day one at every pilot school has no live observations, no photographs and
 * no history. So the card is built from its empty state outwards, and every
 * absent thing is OMITTED, never filled:
 *
 *   no read at all   → one honest sentence and the session. No faces, no
 *                      invented sky, and specifically not a "fine day".
 *   no cast          → no faces row. Not an empty row, not a skeleton, not a
 *                      line explaining that there is no data yet.
 *   no photograph    → a drawn field-guide plate. Never a grey box.
 *   nothing to say  → no summary. It names the session when there is one and
 *                      points at a lead species when one is safe to point at,
 *                      and otherwise does not exist.
 *
 * There is no state of this component that renders a placeholder.
 */
export function DailyCard({
  data,
  scope = "school",
  locale = "uk",
}: {
  data: DailyCardData;
  /**
   * Whose patch this is. "school" only when the active class carries real
   * coordinates; "sample" is the signed-out demo, and says so — the card
   * never claims a school it does not know.
   */
  scope?: "school" | "sample";
  locale?: Locale;
}) {
  const { condition, temperature, sky, cast, summary } = data;

  /* ── the quiet card: we could not see outside ──────────────────────────
     Not a fine day. A fine day is something we observed; this is the absence
     of an observation, and saying "mild and clear" here would be the card
     inventing weather. The session stands on its own underneath. */
  if (condition === null) {
    return (
      <section className="daily-card daily-card-quiet">
        <p className="outside-eyebrow">
          <KindIcon kind="conditions-line" size={18} />
          outside now
        </p>
        <p className="daily-quiet-line">
          We could not see outside today, so there is nothing new to report.
          Your plan is unchanged.
        </p>
      </section>
    );
  }

  const { state, adjustment } = condition;
  const fine = state === "fine";

  // Two faces on a quiet day, three when the day is worth talking about. A
  // mild morning does not force a third face into a card that has nothing to
  // add, and a cast shorter than that simply shows what it has.
  // A PHOTOGRAPH IS THE GATE ON THE SEEN CLAIM (#178). A recorded observation
  // that came back without one is real, but this card has no room to make its
  // provenance unmistakable at face size, and #178 settled that the seen group
  // requires a photograph. It is not demoted to the regional group — that
  // would be restating its claim, which is the one thing the tiers forbid — it
  // simply does not take one of the card's two or three slots. It still rides
  // the lesson and the printed sheet, where its plate carries "seen here" in
  // words on the image. "Shown cards are printed cards" is about the same cast
  // in the same order, and the card was always showing fewer than the sheet.
  // Presence and photography are independent. A valid nearby record without
  // a releaseable image remains a recorded member and renders as a plate.
  const faces = cast.members.slice(0, fine ? 2 : 3);

  // Split by claim, not by rank. The order inside each group is the cast's own
  // findability order, so the card, the lesson and the printed sheet still
  // agree on which creature leads.
  const seen = faces.filter((m) => m.honestyTier === "recorded" && !m.absent);
  const around = faces.filter((m) => m.honestyTier !== "recorded" || m.absent);

  return (
    <section className={`daily-card daily-card-${state}${fine ? " daily-card-airy" : ""}`}>
      {/* Just "outside now". Johan, 16 August: "remove pointmoon references
          very redundant". The engine's name is our plumbing, not a teacher's
          concern — she wants to know this is about right now and outside, and
          naming the supplier tells her nothing she can use. It also kept this
          eyebrow out of step with the invite card on `/`, which has always
          said only "outside now". This repo is class-agnostic besides, so a
          Rewyld-side service name does not belong on its surfaces. */}
      <p className="outside-eyebrow">
        <KindIcon kind="conditions-line" size={18} />
        outside now
      </p>

      <p className="daily-conditions">
        {temperature && <span className="daily-temp">{temperature}</span>}
        {sky && <span className="daily-sky">{sky}</span>}
      </p>

      {/* One line, or none. Two pieces of advice is a briefing, and she is
          putting coats on thirty children. */}
      {adjustment && <p className="daily-adjust">{localizeText(adjustment, locale)}</p>}

      {/* What today holds, in the slot the hero photograph used to fill. It
          names the session first, which is usability I1's fix: the session
          block sits below the fold on a phone, and all three personas failed
          to find what the class was doing. Null on a quiet day with nothing
          to say, and then nothing renders. */}
      {summary && <p className="daily-summary">{localizeText(summary, locale)}</p>}

      {/* TWO GROUPS, TWO CLAIMS (#178). A photographed observation near this
          school and the region's seasonal record are different claims, so they
          never share a caption. The faces also carry their tier ON the image,
          which is the per-item version of the same rule — but a shared caption
          above a mixed row would still say one thing about both, so the row is
          split rather than captioned neutrally. On a day-one card every face
          is regional, and the only caption on screen claims only the season. */}
      {seen.length > 0 && (
        <>
          <p className="outside-caption">{SEEN_CAPTION[scope]}</p>
          <ul className="cast-faces">
            {seen.map((member) => (
              <li key={member.sortRank}>
                <CastFace member={member} />
              </li>
            ))}
          </ul>
        </>
      )}

      {around.length > 0 && (
        <>
          <p className="outside-caption">{USUALLY_AROUND_CAPTION}</p>
          <ul className="cast-faces">
            {around.map((member) => (
              <li key={member.sortRank}>
                <CastFace member={member} />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* THE WAY THROUGH TO THE REST OF THE READ (#304).
          This card shows two faces on a mild day and three otherwise, and that
          restraint is deliberate and stays. What was wrong is that it was also
          the ONLY place the morning's read landed: Pointmoon returns fifteen
          photographed species, the moon, sunrise and sunset, how much light is
          left and what the sky is about to do, and every one of those died at
          this card's edge. The door keeps its silence; the room behind it now
          exists. Offered only when there is genuinely more to see, so it is
          never a link to a page that says nothing. */}
      {cast.members.length > faces.length && (
        <Link className="daily-more" href="/outside">
          See everything out there
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </section>
  );
}
