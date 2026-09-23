import { groupNoun, isNonSchoolGroup } from "@/lib/group-profile";
import { requestLocale } from "@/lib/request-locale";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActiveClass, getTeacher } from "@/lib/teacher";
import { schoolWorld } from "@/lib/world";
import { WorldAround } from "@/app/WorldAround";
import { PlacePhotos } from "@/app/PlacePhotos";
import { readPlacePhotos } from "@/lib/outside/place-photos";
import { AppNav } from "../AppNav";
import { localizeText } from "@/lib/localization";
import { LocationButton } from "../classes/LocationButton";
import { WorldForm } from "./WorldForm";
import styles from "@/app/world.module.css";
import { groundsPlaceForClass, groundsPlaceSelect } from "@/lib/grounds";

/**
 * Grounds (/world): the four zooms, as a page a teacher keeps.
 *
 * The richer Grounds questions live here so they can be skipped during setup and changed
 * afterwards. That is the point rather than a convenience: a school gets a pond
 * in March, a tree comes down in a storm, a new grounds contractor mows the
 * wild corner. Johan, 2026-08-17: nothing here should be hardcoded or frozen,
 * things are fluid and anything not seasonally fresh is bad.
 *
 * The two halves refresh differently and that difference is the design. Zooms
 * one and two re-read every time this page loads, because the season moves and
 * maps get corrected. Zooms three and four only ever change when she says so,
 * because they are her testimony and nothing else can overwrite it.
 */
export const dynamic = "force-dynamic";

export default async function WorldPage({
  searchParams,
}: {
  searchParams?: Promise<{ classId?: string; locale?: string; change?: string }>;
}) {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const active = await getActiveClass(teacher.id);
  const query = await searchParams;
  const requestedClassId = query?.classId;
  const classId = requestedClassId ?? active?.id;
  if (!classId) {
    return (
      <main className={styles.page}>
        <AppNav />
        <h1>Places</h1>
        <p className={styles.said}>
          Add a group first to set its location.
        </p>
        <p>
          <Link href="/classes">Manage groups</Link>
        </p>
      </main>
    );
  }

  const target = await prisma.class.findFirst({
    where: { id: classId, teacherId: teacher.id },
    select: {
      id: true,
      name: true,
      groupType: true,
      school: true,
      lat: true,
      lng: true,
      climate: true,
      grounds: true,
      siteFeatures: true,
      siteNotes: true,
      reach: true,
      placeRead: true,
      placeReadAt: true,
      groundsProfile: {
        select: {
          ...groundsPlaceSelect,
          classes: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!target) redirect("/classes");
  const place = groundsPlaceForClass(target);
  // The noun this page is named for is the one a US reader flagged (#872);
  // every label here goes through the locale layer, never an edit.
  const locale = await requestLocale(query?.locale, { lat: place.lat, lng: place.lng });
  const t = (text: string) => localizeText(text, locale);

  const [profiles, world, shots] = await Promise.all([
    prisma.grounds.findMany({
      where: { teacherId: teacher.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        school: true,
        classes: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    schoolWorld({ lat: place.lat, lng: place.lng, climate: place.climate }),
    // Photographs of the area, from Wikimedia Commons. Fetched alongside the
    // rest rather than after it, and fail-soft: a slow or absent read renders
    // nothing and costs the page nothing. Twelve rather than eight since #751:
    // they lead the page now, and a lead row that runs out after four flicks
    // reads as a stub.
    readPlacePhotos({ lat: place.lat, lng: place.lng, limit: 12 }),
  ]);
  const linkedClasses = target.groundsProfile?.classes ?? [{ id: target.id, name: target.name }];
  const otherLinked = linkedClasses.filter((linked) => linked.id !== target.id);

  return (
    <main className={styles.page}>
      <AppNav />
      <header>
        <p className={styles.eyebrow}>{t(`Place for ${target.name}`)}</p>
        <h1>{place.name}</h1>
        <p className={styles.said}>
          {t(`What is around ${place.school}, and what this ${groupNoun(target.groupType)} can reach. Change it whenever the place changes.`)}
        </p>
      </header>

      <section className={styles.assignment} aria-labelledby="grounds-assignment-title">
        <h2 id="grounds-assignment-title" className={styles.head}>
          {t(`${target.name} uses this place`)}
        </h2>
        <p className={styles.said}>
          {otherLinked.length > 0
            ? `Shared with ${otherLinked.map((linked) => linked.name).join(", ")}.`
            : `Only ${target.name} uses this profile.`}
          {" "}{t(isNonSchoolGroup(target.groupType) ? "Changing place keeps the same group selected." : "Changing place does not change the class you are teaching.")}
        </p>
        <details className={styles.change} open={query?.change === "1"}>
          <summary>{t("Choose another place")}</summary>
          <div className={styles.currentLocation}>
            <LocationButton
              classId={target.id}
              hasLocation={typeof place.lat === "number" && typeof place.lng === "number"}
              label={t("Use current location")}
              returnTo="/today"
            />
          </div>
          {/* Plain POSTs to a route handler that answers 303, not server
              actions: the browser performs the navigation, so it cannot be
              dropped the way the router dropped it in nc#949. */}
          <form method="post" action="/world/place" className={styles.chooser}>
            <input type="hidden" name="intent" value="assign" />
            <input type="hidden" name="classId" value={target.id} />
            <fieldset>
              <legend>{t(`Choose a place for ${target.name}`)}</legend>
              {profiles.map((profile) => (
                <label key={profile.id} className={styles.choice}>
                  <input
                    type="radio"
                    name="groundsId"
                    value={profile.id}
                    defaultChecked={profile.id === place.id}
                    required
                  />
                  <span>
                    <strong>{profile.name}</strong>
                    <small>
                      {profile.school} · {profile.classes.length > 0
                        ? `Used by ${profile.classes.map((linked) => linked.name).join(", ")}`
                        : "Not currently used by a group"}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            <button type="submit" className="signin-submit">{t("Use selected place")}</button>
          </form>
          <form method="post" action="/world/place" className={styles.create}>
            <input type="hidden" name="intent" value="create" />
            <input type="hidden" name="classId" value={target.id} />
            <label>
              {t("Create a separate place")}
              <input
                className="signin-input"
                name="name"
                required
                maxLength={80}
                defaultValue={`${target.name} place`}
              />
            </label>
            <p className={styles.src}>
              Starts with an exact copy of this profile and assigns it only to {target.name}.
            </p>
            <button type="submit" className="class-choose">{t("Create separate place")}</button>
          </form>
        </details>
      </section>

      {/* Photos first (#751). They used to sit under two blocks of sentences
          about the season and the map, which is the wrong way round for a
          teacher opening this page: a picture of her area tells her where she
          is standing faster than any line we can write, and the first real
          teacher session asked for exactly this weight. Absent when nothing
          was found — absence still ships as absence. */}
      <PlacePhotos photos={shots.photos} area={place.school} lead />

      {/* Zooms one and two: read, not answered. */}
      <WorldAround {...world} school={place.school} locale={locale} />

      {/* No location yet: the read half cannot exist, the told half still can. */}
      {place.lat === null && (
        <p className={styles.src}>
          {t("Set this place's location in")} <Link href="/classes">{isNonSchoolGroup(target.groupType) ? "group settings" : "My classes"}</Link> and
          the first two parts fill in.
        </p>
      )}

      {/* Zooms three and four: hers. */}
      <WorldForm
        locale={locale}
        classId={target.id}
        features={place.siteFeatures}
        notes={place.siteNotes}
        reach={place.reach}
      />
    </main>
  );
}
