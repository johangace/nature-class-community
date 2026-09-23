import Link from "next/link";
import { displaySpeciesName } from "@/lib/cast/species-name";
import { FieldGuidePlate } from "./FieldGuidePlate";
import {
  castMaterial,
  displayPhotoAsset,
  displayPhotoUrl,
  speciesHref,
  type CastMember,
} from "@/lib/cast/member";
import type { TopicTag } from "@/schema/pack";
import { PhotoCredit, photoCreditText } from "./PhotoCredit";
import { ObservedCredit } from "./ObservedCredit";

/**
 * One face of the cast — the portrait component every surface shares.
 *
 * HONESTY IS CARRIED BY THE IMAGE, not by a coloured chip. Four materials,
 * and each one survives a photocopy and colourblind eyes because the
 * difference is in the treatment, not the hue:
 *
 *   seen      full-fidelity photograph. Recorded near here.
 *   regional  the photograph inset in a paper frame. Around the region.
 *   absent    desaturated behind a hatched frame. Hoped for, not seen.
 *   plate     a drawn field-guide plate on paper. We have no photograph.
 *
 * The plate is the one that matters most and is the easiest to get wrong. A
 * missing photograph is the ORDINARY case — most regional species have no
 * open-licensed photo near a given school, and on day one at a pilot school
 * almost nothing does. A grey box says "broken". A plate on paper says "this
 * is a field guide", which is what the thing actually is. There is no state in
 * this component that renders an empty rectangle.
 *
 * The face carries a photo, a name, and ONE LINE IN THE CHILD'S LANGUAGE.
 * Nothing else.
 *
 * There was a fourth thing until Johan reviewed the deployed card: a "seen
 * here" chip on the image. It is gone, and the honesty tier it carried is now
 * held by the image material alone — full-fidelity photograph, paper-frame
 * inset, drawn plate. That was always the stronger carrier: it survives a
 * photocopy and colourblind eyes, where a chip is just more text on a face
 * that already has a name on it. The tier is stated in words where a teacher
 * goes to ask, which is the profile, one tap away.
 *
 * The line changed with it. It used to be provenance ("seen here lately", "34
 * logged nearby") — a sentence about our database, addressed to nobody, that
 * a teacher cannot read out and a child has no use for. It is now the
 * phenology's own child-language note, and a species without one shows no
 * line rather than a manufactured one.
 *
 * ONE EXCEPTION, AND IT IS DATED (#959). Under the curated line a face may
 * carry the observed leg — "In flower, seen 2 days ago" — and
 * only when Pointmoon returned a record with its own instant. That is not
 * provenance about our database; it is a thing somebody saw, which a child
 * can go and check. It is styled apart from the curated line so the two tiers
 * never blur, and a member without a dated record shows nothing there.
 *
 * THE WHOLE FACE IS THE TAP TARGET, and it is a real link rather than a click
 * handler: a teacher outdoors is tapping through a glove at arm's length, and
 * a link can also be opened, kept, and reached by keyboard and screen reader
 * in the order it is read. `size="hero"` renders the same four materials as
 * the profile's own portrait WITHOUT the link, because the profile is where
 * the tap already landed.
 */
export function CastFace({
  member,
  size = "face",
  showPhotoCredit = true,
  profileTopic = null,
  fromRun = null,
}: {
  member: CastMember;
  /**
   * "face" = the tappable card face. "hero" = the profile's own portrait.
   * "tile" = a compact linked row, one mount for every tier (#341, #233).
   * "prompt" = an unlinked identification picture with its own credit.
   */
  size?: "face" | "hero" | "tile" | "prompt";
  /** Hide the visible credit when the photo links to its source or credited profile. */
  showPhotoCredit?: boolean;
  /** The lesson producer scope to replay if this face came from a lesson cast. */
  profileTopic?: TopicTag | null;
  /** The live run this face is tapped from, so the profile can lead back (#874). */
  fromRun?: string | null;
}) {
  const material = castMaterial(member);
  const photo = displayPhotoAsset(member);
  // Precomputed at resolve time: no clock runs here, so server and client
  // render the same words (Codex review on PR #960, round five).
  const observed = member.observed ?? null;

  if (size === "hero") {
    return (
      <div className="cast-face-shell cast-face-shell-hero">
        <div className={`cast-portrait cast-portrait-hero cast-portrait-${material}`}>
          <Portrait member={member} material={material} showCredit />
        </div>
      </div>
    );
  }

  // A prompt can name a seasonal species outside the bounded live cast, so it
  // cannot rely on a species-profile link to carry the image credit. It uses
  // the same portrait floor and material as every CastFace, with the receipt
  // kept quietly beside this particular image.
  if (size === "prompt") {
    return (
      <div className="cast-prompt">
        {photo?.sourceUrl && !showPhotoCredit ? (
          <a className="cast-tile-plate" href={photo.sourceUrl} target="_blank" rel="noreferrer"
            title={photoCreditText(photo) ?? undefined}
            aria-label={`Open photo source for ${member.commonName}`}>
            <Portrait member={member} material={material} lazy />
          </a>
        ) : (
          <span className="cast-tile-plate" title={photo ? photoCreditText(photo) ?? undefined : undefined}>
            <Portrait member={member} material={material} lazy />
          </span>
        )}
        {photo && showPhotoCredit && <PhotoCredit asset={photo} />}
      </div>
    );
  }

  /**
   * TILE — compact Today and lesson rows, where material stops carrying the tier.
   *
   * ONE MOUNT FOR EVERY TIER. The paper inset that distinguishes a regional
   * reference photograph from a recorded one is not rendered at this size, and
   * that is a size decision rather than a change to the material system: it
   * stays exactly as it is on /outside, /world and the profile, which are the
   * surfaces where a photograph is actually examined.
   *
   * The design lead measured why. 11px of paper is about six per cent of a
   * 168px tile, glare is additive and eats light-on-light first, and a pale
   * photograph inside a pale border at tile size reads as an empty card. A
   * distinction that degrades into the failure mode it exists to prevent is
   * worse than no distinction. Nothing over-claims without it: the heading is
   * true of both tiers, no line under a name is phrased as a sighting, and the
   * tier is stated in words on the page every tile opens — which is the rule
   * `CastFace` itself set when the "seen here" chip came off.
   *
   * AND NO CREDIT HERE, which is a licence decision and not a tidy-up. CC BY
   * 4.0 §3(a)(2) allows attribution "in any reasonable manner based on the
   * medium, means, and context" and names a link to a resource carrying the
   * information. So the rule is hard and it is the reason the tile is a link:
   * A PHOTOGRAPH MAY ONLY APPEAR HERE AS A LINK, AND THE TARGET MUST CARRY ITS
   * CREDIT. `/species/[slug]` renders `size="hero"`, which renders the credit
   * whenever a photograph exists. Break that link and the credit comes back
   * onto the tile.
   */
  if (size === "tile") {
    return (
      <Link href={speciesHref(member, profileTopic, fromRun)} className="cast-tile">
        <span className="cast-tile-plate">
          <Portrait member={member} material={material} lazy />
        </span>
        {/* SENTENCE CASE, AS PRESENTATION ONLY. iNaturalist serves title
            case and our phenology files are lowercase, so one row showed four
            names in two conventions. The stored name is never edited — see
            lib/cast/species-name.ts for why that rule is not negotiable. */}
        <span className="cast-tile-name">{displaySpeciesName(member.commonName)}</span>
        {member.line && <span className="cast-tile-line">{member.line}</span>}
        {observed && (
          <span className="cast-tile-observed">
            {observed}
            <ObservedCredit />
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="cast-face-shell">
      <Link href={speciesHref(member, profileTopic, fromRun)} className="cast-face">
        <div className={`cast-portrait cast-portrait-${material}`}>
          <Portrait member={member} material={material} lazy />
        </div>
        <p className="cast-face-name">{member.commonName}</p>
        {/* Omitted rather than rendered empty: a face with nothing to say shows
            a photo and a name, not a blank line reserving space for one. */}
        {member.line && <p className="cast-face-line">{member.line}</p>}
        {observed && (
          <p className="cast-face-observed">
            {observed}
            <ObservedCredit />
          </p>
        )}
      </Link>
      {photo && showPhotoCredit && <PhotoCredit asset={photo} />}
    </div>
  );
}

/**
 * The picture itself, with the plate ALWAYS UNDERNEATH IT.
 *
 * The plate is not the no-photo branch any more, it is the floor. Every
 * portrait draws it, and a photograph is laid on top when we have one.
 *
 * This is the fix for a defect the screen caught and the code could not: a
 * `photoUrl` that 404s, or whose host is blocked, or that a school's network
 * filters, renders as an EMPTY BOX. We were careful never to ship a grey box
 * and then shipped one anyway, drawn by the browser rather than by us, on
 * exactly the surfaces built to be honest when there is nothing to show.
 *
 * Underneath rather than an onError swap, deliberately: onError needs
 * JavaScript, and these are server components rendering on a school iPad on a
 * bad connection. A broken image on top of a drawn plate degrades to the plate
 * with no script, no hydration and no flash — the same answer we would have
 * given if the URL had never existed. It costs one inline SVG per face.
 */
function Portrait({
  member,
  material,
  lazy = false,
  showCredit = false,
}: {
  member: CastMember;
  material: ReturnType<typeof castMaterial>;
  lazy?: boolean;
  showCredit?: boolean;
}) {
  const photoUrl = displayPhotoUrl(member);
  const photo = displayPhotoAsset(member);
  return (
    <>
      {/* THE PLATE'S WORDS BELONG TO THE PLATE, NOT TO THE FLOOR.
          #194 made the plate the floor under every portrait so a dead photo
          URL uncovers a drawing instead of the browser's broken-image box.
          It kept rendering the FULL plate underneath, though, so a member with
          a real photograph still carried "drawn, not photographed" in its
          markup — under the picture visually, and read out as the caption for
          it. The production walk caught exactly that on /session: two species
          with real iNaturalist photos captioned as drawings, while the same
          species said "seen here" on their profile and in print.
          The floor is now the wordless frame; the words appear only when the
          plate IS the picture. */}
      <FieldGuidePlate
        name={member.commonName}
        iconicTaxon={member.iconicTaxon}
        compact={material !== "plate"}
      />
      {material !== "plate" && photoUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          className="cast-photo"
          src={photoUrl}
          alt={member.commonName}
          loading={lazy ? "lazy" : undefined}
          decoding="async"
        />
      )}
      {showCredit && photo && (
        <PhotoCredit asset={photo} className="photo-credit-on-image" />
      )}
    </>
  );
}
