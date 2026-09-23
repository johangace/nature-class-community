import { Wordmark } from "@/app/Wordmark";
import {
  castMaterial,
  castSlug,
  displayPhotoAsset,
  tierLabel,
  type CastMember,
} from "@/lib/cast/member";
import { PhotoCredit } from "@/app/PhotoCredit";

/**
 * The printed cast cards — the same creatures she showed outside, on paper.
 *
 * "Shown cards are printed cards" is the promise, and it is only true because
 * every surface reads one accessor: the daily card, the speak-and-show and
 * this page all render `getClassCast`'s members in `sortRank` order, so the
 * three cannot disagree about what today is about.
 *
 * ── HONESTY THAT SURVIVES A PHOTOCOPIER ────────────────────────────────────
 *
 * A school printer is black and white, usually toner-poor, and the sheet gets
 * photocopied thirty times. So the three tiers are distinguished by FRAME and
 * HATCH, never by colour or grey level:
 *
 *   recorded  solid 1.5pt border, clean white field.
 *   regional  double border (an inset rule inside the outer one) — the paper
 *             frame from the screen, rendered in the only ink there is.
 *   absent    dashed border plus a diagonal hatch across the field.
 *
 * Greyscale tints were the obvious answer and are the wrong one: a 15% grey
 * and a 25% grey are the same colour after two photocopies, and the whole
 * point of the tier is that a child holding the sheet can tell "we have seen
 * this near school" from "we are hoping". Line weight and pattern survive
 * generational copying; fill does not.
 *
 * ── THE CARDS ARE NEVER PADDED ─────────────────────────────────────────────
 *
 * A thin cast prints fewer cards. It never prints an invented one, never a
 * blank cut-out to "fill the row", and when there is no cast at all this
 * component renders nothing and the sheet is the sheet it always was. A child
 * cutting out a card for a creature nobody expects is the invented-nature
 * failure with scissors.
 */
export function CastCards({
  members,
  /** Whose patch. Never claims a school without coordinates. */
  located,
  /** The date the cast was read, so the paper says when it was true. */
  readOn,
  /**
   * What the geocoder called the point these cards were read for (#463).
   * Shown only when `!located`: a child cutting out a heather and a common
   * swift card for a classroom 3,700 miles away deserves the sheet to say
   * whose patch it actually is. Undefined or null renders nothing, which is
   * the same honest silence every other absence on this sheet keeps.
   */
  placeName,
}: {
  members: CastMember[];
  located: boolean;
  readOn: string;
  placeName?: string | null;
}) {
  // Six is the sheet's honest ceiling: three across, two rows, at a size a
  // five-year-old can cut around.
  const cards = members.slice(0, 6);
  if (cards.length === 0) return null;

  return (
    <section className="print-cast" aria-label="Cast cards to cut out">
      <div className="print-masthead">
        <Wordmark seed className="print-logo" />
        <span>Reference cards</span>
      </div>
      <h2>Cut these out. Take them outside. Tick the ones you meet.</h2>
      <p className="print-cast-meta">
        Who we might meet · read on {readOn}
      </p>
      {!located && placeName && (
        <p className="print-cast-place">
          Read for {placeName}, a sample patch. Not your own grounds.
        </p>
      )}

      <ul className="print-cast-row">
        {cards.map((member) => {
          const material = castMaterial(member);
          const photo = displayPhotoAsset(member);
          return (
            <li key={castSlug(member)} className={`print-card print-card-${material}`}>
              <div className="print-card-frame">
                {photo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={photo.url} alt="" />
                ) : (
                  /* No photograph: the drawn plate's frame, empty, as a place
                     for a child to draw it when they find it. That is a better
                     answer on paper than any stand-in image. */
                  <span className="print-card-draw">draw it here</span>
                )}
              </div>
              {photo && <PhotoCredit asset={photo} className="photo-credit-print" />}
              <p className="print-card-name">{member.commonName}</p>
              {/* The tier in words as well as in the frame. The frame is what
                  survives a bad photocopy; the words are what a teacher reads
                  aloud when a child asks why this one is dashed. */}
              <p className="print-card-tier">{tierLabel(member)}</p>
              <div className="print-card-footer">
                <span className="print-card-tick" aria-hidden="true" />
                <Wordmark seed className="print-logo" />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The teacher A4's quiet "you may meet" strip.
 *
 * Deliberately a LIST OF NAMES and not a second set of cards. Her sheet is a
 * lesson plan she scans while thirty children put coats on; the pictures are
 * on her phone and on the children's sheet, and repeating them here would push
 * the phases onto a second page for no gain. Names plus tier is what she needs
 * to recognise a thing a child holds up.
 *
 * Renders nothing when the cast is empty. There is no "no species today" line
 * on a lesson plan.
 */
export function MayMeetStrip({
  members,
  located,
  placeName,
}: {
  members: CastMember[];
  /** Whose patch. Undefined behaves as unlocated, the safer default (#463). */
  located?: boolean;
  /** What the geocoder called the point, when this is a sample read. */
  placeName?: string | null;
}) {
  const named = members.slice(0, 6);
  if (named.length === 0) return null;

  return (
    <section className="print-maymeet">
      <h2>You may meet</h2>
      {!located && placeName && (
        <p className="print-maymeet-place">
          Read for {placeName}, a sample patch. Not your own grounds.
        </p>
      )}
      <ul>
        {named.map((member) => (
          <li key={castSlug(member)}>
            <span className="print-maymeet-name">{member.commonName}</span>
            <span className="print-maymeet-tier">{tierLabel(member)}</span>
            {member.safetyNote && (
              /* The one thing on this strip that is not just a name. If a
                 species needs look-don't-touch, her own sheet says so, because
                 she may be reading from paper with no device at all. */
              <span className="print-maymeet-safe">{member.safetyNote}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
