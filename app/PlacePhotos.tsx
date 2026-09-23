import type { PlacePhoto } from "@/lib/outside/place-photos";
import styles from "@/app/world.module.css";

/**
 * What her area looks like, in photographs.
 *
 * Zooms one and two tell a teacher what her week and her map say. This shows
 * it. Johan, 2026-08-17: *"I need you to find more photos of rocks, places
 * anything!!"* — and until now the product had no way to show a photograph of
 * anything that was not a species.
 *
 * THE CAPTION IS THE WHOLE HONESTY MECHANISM. These are geotagged photographs
 * taken within a couple of kilometres, by strangers, over twenty years. Not
 * her grounds, not this week, not necessarily anything a class can walk to. So
 * the heading says her area and the credit line says who took it and under
 * what licence, and nothing anywhere implies otherwise. That is the same
 * discipline the cast runs on, where `recorded` is never spoken as `regional`.
 *
 * Chrome-free per T1 (#231): a row of pictures under a line of type. No cards,
 * no borders, no tray.
 *
 * `lead` (#751) renders the row bigger, for the one place it is the first
 * thing on the page rather than a band inside it. Johan, after the first real
 * teacher session: "more importance on photos etc." Weight here is size and
 * position, not new chrome — the pictures simply get to be the thing you meet
 * first on /world, above the sentences about the season.
 */
export function PlacePhotos({
  photos,
  area,
  lead = false,
}: {
  photos: PlacePhoto[];
  area?: string | null;
  lead?: boolean;
}) {
  // Absence ships as absence. A surface that says "no photographs found near
  // your school" has told a teacher something about our coverage rather than
  // about her place, and she cannot act on it.
  if (photos.length === 0) return null;

  return (
    <section className={lead ? `${styles.zoom} ${styles.zoomLead}` : styles.zoom}>
      <p className={styles.eyebrow}>photos of your area</p>
      <h2 className={styles.head}>
        {area ? `Photos taken around ${area}` : "Photos taken in your area"}
      </h2>
      <p className={styles.said}>
        Taken nearby by other people, over the years. Not your grounds, and not
        this week.
      </p>
      <ul className={lead ? `${styles.shots} ${styles.shotsLead}` : styles.shots}>
        {photos.map((photo) => (
          <li key={photo.id} className={styles.shot}>
            {/*
              Plain <img>: these are remote thumbnails from Wikimedia, already
              width-bounded upstream, and the rest of this product's imagery
              renders the same way (CastFace, LessonMediaStrip). Alt carries the
              title, because a photograph of a place IS its description here.
            */}
            <img src={photo.url} alt={photo.title} loading="lazy" decoding="async" />
            <p className={styles.shotname}>{photo.title}</p>
            <p className={styles.shotcredit}>
              <a href={photo.sourceUrl} rel="noreferrer noopener" target="_blank">
                {photo.credit}
              </a>
              {photo.license === "unstated" ? "" : `, ${photo.license}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
