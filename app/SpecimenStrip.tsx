import type { DisplayPhotoAsset } from "@/lib/cast/member";
import { PhotoCredit } from "./PhotoCredit";

/**
 * More than one picture of the same species, at list scale.
 *
 * ── WHY THIS EXISTS (#984, pointmoon#153, #233) ────────────────────────────
 *
 * A child in front of a robin is not asking what a robin looks like. They are
 * asking whether THIS is one — and one photograph, from one angle, in one
 * light, at one age, is a poor way to answer that. The species door has wanted
 * three specimens since #233 and could only ever show one, because Pointmoon
 * served one and there was nowhere to put a second.
 *
 * ── THE TWO CLAIMS ARE TWO SECTIONS, NOT TWO CHIPS ─────────────────────────
 *
 * A photograph taken near this school last week and a photograph of the
 * species taken in Finland in 2011 are both useful and are NOT the same claim.
 * #33 is what it cost to blur them once already. Rather than trust a per-image
 * badge to carry that — badges are the first thing to be cropped out of a
 * screenshot and the first thing an eye stops reading — the roles are split
 * into separately headed rows. The heading is the label, it cannot be
 * detached from the pictures under it, and it survives a photocopy.
 *
 * A deeper gallery is not a stronger claim. Nothing here touches the tier, the
 * count, or the material the portrait is rendered in.
 *
 * ── SMALL, AND DELIBERATELY ────────────────────────────────────────────────
 *
 * Johan on the first round of this page: *"why are the images huge, and 2 of
 * them??"* So these are thumbnails in a wrapping row, not a carousel, not a
 * lightbox, and not a paged full-screen plate. A teacher outdoors with thirty
 * children is scanning, not browsing.
 *
 * The credit rides under each thumbnail because it is a licence condition and
 * not decoration — several of these arrive cc-by, and a cc-by picture is only
 * usable at all with its byline attached.
 */
export function SpecimenStrip({
  photos,
  commonName,
}: {
  /** The whole gallery, element zero included — the hero's picture is dropped here. */
  photos: DisplayPhotoAsset[];
  commonName: string;
}) {
  // Element zero is the portrait the hero already shows. Showing it again
  // under a heading that says something different about it would be the exact
  // blur this component is built to avoid.
  const rest = photos.slice(1);
  if (rest.length === 0) return null;

  const nearby = rest.filter((photo) => photo.role === "observation");
  const reference = rest.filter((photo) => photo.role !== "observation");

  return (
    <>
      {nearby.length > 0 && (
        <Row
          eyebrow="also photographed near here"
          photos={nearby}
          alt={(index) => `${commonName}, photographed near this school (${index + 1})`}
        />
      )}
      {reference.length > 0 && (
        <Row
          // Says exactly what a taxon reference is, in a child's words and
          // without a hedge: somewhere else, some other time, this species.
          eyebrow="what it looks like, elsewhere"
          photos={reference}
          alt={(index) => `${commonName}, photographed elsewhere (${index + 1})`}
        />
      )}
    </>
  );
}

function Row({
  eyebrow,
  photos,
  alt,
}: {
  eyebrow: string;
  photos: DisplayPhotoAsset[];
  alt: (index: number) => string;
}) {
  return (
    <section className="species-strip">
      <p className="species-k">{eyebrow}</p>
      <ul className="species-specimens">
        {photos.map((photo, index) => (
          <li key={photo.url}>
            {/*
              Plain <img>, matching every other remote thumbnail in this
              product (CastFace, PlacePhotos): these are width-bounded
              upstream and are not ours to optimise.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={alt(index)} loading="lazy" />
            <PhotoCredit asset={photo} className="species-specimen-credit" />
          </li>
        ))}
      </ul>
    </section>
  );
}
