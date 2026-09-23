import { localizeText, type Locale } from "@/lib/localization";
import type { SchoolWorld } from "@/lib/world";
import { draftPlaceDescription } from "@/lib/ai/place-description";
import styles from "@/app/world.module.css";

/**
 * Zooms one and two: the world a school is already in, and what a map can see
 * of it. Read, never answered, which is why this is a server component with no
 * controls on it.
 *
 * Johan, 2026-08-17: *"first we zoom in the world they already are.. eg they
 * are in london .. we know what london is like this time of the year what is
 * around"*.
 *
 * EVERY LINE HERE IS SOURCED. The species and the habitats they occupy are
 * real rows from the regional phenology file for this week; the place lines are
 * Pointmoon's OSM-derived `outdoor.place.*` signals. Nothing is composed by a
 * model and nothing is inferred from a climate stereotype. When a source is
 * thin its whole block disappears rather than degrading into a general
 * statement about deserts or Septembers.
 *
 * That is why each block tests its own data separately: a school with no
 * Pointmoon read still gets told what its region is doing, and a school in a
 * region with no phenology rows still gets told what the map can see.
 */
export async function WorldAround({ world, place, school, locale = "uk" }: SchoolWorld & { school?: string | null; locale?: Locale }) {
  // Nothing to say at all. Say nothing, rather than a line about how we will
  // learn about their area soon.
  if (!world && !place.answered) return null;

  // What the map saw, said by the model rather than as six fixed clauses in a
  // fixed order (Johan, 2026-08-17: "add ai intelligence instead of hard coded
  // intelligence"). Null wherever no model is configured, or where a draft
  // claimed a feature nobody observed, and then the plain observed lines
  // render — which is a perfectly good way to be asked "is this right?"
  const described = await draftPlaceDescription({
    observations: place.observations.map((o) => o.says),
    school,
  });

  return (
    <div className={styles.read}>
      {world && (
        <section className={styles.zoom}>
          <p className={styles.eyebrow}>the world you are in</p>
          <h2 className={styles.head}>This is the week you are teaching into</h2>
          <ul className={styles.life}>
            {world.entries.map((entry) => (
              <li key={entry.id}>
                <span className={styles.species}>{entry.species}</span>
                {entry.habitats.length > 0 && (
                  <span className={styles.where}>{entry.habitats.join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
          {world.habitats.length > 0 && (
            <p className={styles.src}>
              Right now the life here is mostly in {world.habitats.slice(0, 3).join(", ")}.
              Regional record, week {world.week}.
            </p>
          )}
        </section>
      )}

      {place.answered && place.observations.length > 0 && (
        <section className={styles.zoom}>
          <p className={styles.eyebrow}>what is around your school</p>
          <h2 className={styles.head}>We had a look at your address</h2>
          {described ? (
            <p>{localizeText(described, locale, [...(world?.entries ?? []).map((entry) => entry.species), school ?? ""])}</p>
          ) : (
            <ul className={styles.seen}>
              {place.observations.map((observation) => (
                <li key={observation.signalId}>{localizeText(observation.says, locale, [school ?? ""])}</li>
              ))}
            </ul>
          )}
          {/*
            Naming the source is not a footnote, it is the invitation to
            disagree. A teacher who knows the map is wrong will only say so if
            she can tell it came from a map.
          */}
          <p className={styles.src}>From the map. Correct anything below that is wrong.</p>
        </section>
      )}
    </div>
  );
}
