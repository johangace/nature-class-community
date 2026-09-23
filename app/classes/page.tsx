import { setClassEnglishLocale } from "./actions";
import { requestLocale } from "@/lib/request-locale";
import { resolveLocale } from "@/lib/location-locale";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { classMinutesOutside, getActiveClass, getTeacher } from "@/lib/teacher";
import { chooseClass, createClass, deleteClass, renameClass } from "./actions";
import { LocationButton } from "./LocationButton";
import { NewClassPlace } from "./NewClassPlace";
import { PlaceMap } from "../place/PlaceMap";
import { AppNav } from "../AppNav";
import { abilityLabel, bandForYearGroup } from "@/lib/ability";
import { GroupFields } from "./GroupFields";
import { groupNoun, isNonSchoolGroup } from "@/lib/group-profile";
import { localizeText } from "@/lib/localization";
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_HREF } from "@/lib/outside/static-map";

/**
 * My classes (/classes).
 *
 * A class is who you teach: name, year group, the minutes-outside number,
 * and whether it is the one you are teaching now. A place is where you take
 * them: the map, the location control and the classes that go out there.
 *
 * Most teachers have one class at one school, and for them this is one card
 * (#913 follow-up, Johan 2026-09-02: a teacher with one class was seeing
 * headings and a second list for one thing). The two lists, Classes and
 * Places, appear from the second class or place: then the place is drawn
 * once, each class points at its place with a chip, and the place answers
 * with "used by". The chip is the only door to the place page, because it
 * opens it as that class, which is where "choose another place" lives.
 *
 * Location belongs to the place. Since shared places landed (#886) the saved
 * position lives on the Grounds row and every class there reads it, so the
 * control sits beside the place and writes through the first class linked
 * to it (actions.ts, setClassLocation). The record of led sessions lives in
 * the Journal (/journal); the fuller place profile lives on the place page.
 */

type PlaceCard = {
  key: string;
  groundsId: string | null;
  name: string;
  school: string;
  lat: number | null;
  lng: number | null;
  classes: { id: string; name: string }[];
};

/** "Willow class", "Willow class and Oak class", "Willow, Oak and Ash". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The picture and the control for one place, once (#876, #913). A ring the
 * size of the rounding rather than a pin; nothing saved, nothing drawn, and
 * an empty frame says so without a sentence. The map's attribution sits in
 * the text beside it rather than under a thumbnail the size of a stamp.
 */
function PlaceBlock({
  place,
  anchorClassId,
  children,
}: {
  place: PlaceCard;
  anchorClassId: string;
  children?: React.ReactNode;
}) {
  const hasLocation = place.lat !== null && place.lng !== null;
  return (
    <div className="place-block">
      {hasLocation && place.lat !== null && place.lng !== null ? (
        <PlaceMap
          compact
          lat={place.lat}
          lng={place.lng}
          label={place.name}
          className="place-card-map"
        />
      ) : (
        <div className="place-card-map place-card-map-empty" aria-hidden="true" />
      )}
      <div className="place-card-body">
        {children}
        <p className="place-meta">
          {hasLocation ? (
            <>
              Location set. Nearby nature is read fresh every morning from what has been seen
              around here lately.{" "}
              <a
                className="place-attribution"
                href={MAP_ATTRIBUTION_HREF}
                rel="noreferrer"
                target="_blank"
              >
                {MAP_ATTRIBUTION}
              </a>
            </>
          ) : (
            "No location yet, so conditions use the default."
          )}
        </p>
        <LocationButton classId={anchorClassId} hasLocation={hasLocation} />
      </div>
    </div>
  );
}

export default async function ClassesPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string }>;
}) {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const [classes, active] = await Promise.all([
    prisma.class.findMany({
      where: { teacherId: teacher.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        yearGroup: true,
        groupType: true,
        ageRange: true,
        englishLocale: true,
        school: true,
        lat: true,
        lng: true,
        groundsProfile: {
          select: {
            id: true,
            name: true,
            school: true,
            lat: true,
            lng: true,
          },
        },
      },
    }),
    getActiveClass(teacher.id),
  ]);

  const tallies = new Map(
    await Promise.all(
      classes.map(
        async (c) => [c.id, await classMinutesOutside(c.id)] as const
      )
    )
  );
  const localeOverride = (await searchParams)?.locale;
  const formLocale = await requestLocale(
    localeOverride,
    active ? { lat: active.lat, lng: active.lng } : null
  );
  const t = (text: string) => localizeText(text, formLocale);

  // The places, each drawn once. A class made before shared places existed
  // has no profile row and stands as a place of its own, keyed by the class.
  const places = new Map<string, PlaceCard>();
  const placeKeyOf = new Map<string, string>();
  for (const c of classes) {
    const profile = c.groundsProfile;
    const key = profile ? `place-${profile.id}` : `place-class-${c.id}`;
    placeKeyOf.set(c.id, key);
    const found = places.get(key);
    if (found) {
      found.classes.push({ id: c.id, name: c.name });
      continue;
    }
    places.set(key, {
      key,
      groundsId: profile?.id ?? null,
      name: profile?.name ?? c.school,
      school: profile?.school ?? c.school,
      lat: profile ? profile.lat : c.lat,
      lng: profile ? profile.lng : c.lng,
      classes: [{ id: c.id, name: c.name }],
    });
  }
  const placeList = [...places.values()];
  const activePlaceKey = active ? placeKeyOf.get(active.id) : undefined;
  const realPlaces = placeList.filter((place) => place.groundsId !== null);
  // One class at one place is one card, no headings, no second list.
  const solo = classes.length === 1 && placeList.length === 1;
  const includesNonSchool = classes.some((c) => isNonSchoolGroup(c.groupType));
  const collectionTitle = includesNonSchool ? "My groups" : "My classes";

  const tallyLine = (classId: string, isActive: boolean) => {
    const tally = tallies.get(classId);
    if (isActive) {
      if (tally && tally.sessionsLed > 0 && tally.countedSessions === 0) {
        return `${tally.sessionsLed} ${tally.sessionsLed === 1 ? "session" : "sessions"} led`;
      }
      return tally && tally.sessionsLed > 0
        ? `${tally.minutes.toLocaleString()} child-minutes outside so far`
        : "first session ahead";
    }
    if (tally && tally.sessionsLed > 0 && tally.countedSessions === 0) {
      return `${tally.sessionsLed} ${tally.sessionsLed === 1 ? "session" : "sessions"} led`;
    }
    return tally && tally.sessionsLed > 0
      ? `${tally.minutes.toLocaleString()} child-minutes outside · ${tally.sessionsLed} ${
          tally.sessionsLed === 1 ? "session" : "sessions"
        }`
      : "no sessions logged yet";
  };

  const placeChip = (
    c: { id: string; name: string; school: string; lat: number | null; lng: number | null; englishLocale?: string | null },
    place: PlaceCard | undefined
  ) => {
    const hasLocation = place !== undefined && place.lat !== null && place.lng !== null;
    const locale = resolveLocale(localeOverride ?? c.englishLocale ?? undefined, place ?? c);
    return (
      <Link
        className="class-place-chip"
        href={`/world?classId=${encodeURIComponent(c.id)}`}
        aria-label={localizeText(`Open ${c.name} place`, locale)}
      >
        <span
          className="class-place-dot"
          data-located={hasLocation ? "yes" : "no"}
          aria-hidden="true"
        />
        at {place?.name ?? c.school}
        {!hasLocation && " · no location yet"}
      </Link>
    );
  };

  const settings = (c: { id: string; name: string; englishLocale?: string | null; groupType?: string | null }) => (
    <details className="class-edit">
      <summary>Settings</summary>
      <div className="class-edit-panel">
        <form action={setClassEnglishLocale} className="class-rename">
          <input type="hidden" name="classId" value={c.id} />
          <label htmlFor={`english-${c.id}`}>Lesson language</label>
          <select id={`english-${c.id}`} name="locale" className="signin-input" defaultValue={c.englishLocale ?? "auto"}>
            <option value="auto">{isNonSchoolGroup(c.groupType) ? "Automatic (location)" : "Automatic (school location)"}</option>
            <option value="us">English (US)</option>
            <option value="uk">English (UK)</option>
          </select>
          <button type="submit" className="class-choose">Save language</button>
          <p className="account-note">Applies to this {groupNoun(c.groupType)} on every device. Open your saved lesson while online after changing language to refresh this device’s download.</p>
        </form>
        <form action={renameClass} className="class-rename">
          <input
            className="signin-input"
            name="name"
            defaultValue={c.name}
            required
            maxLength={80}
            aria-label={isNonSchoolGroup(c.groupType) ? "Group name" : "Class name"}
          />
          <input type="hidden" name="classId" value={c.id} />
          <button type="submit" className="class-choose">
            Rename
          </button>
        </form>
        <form action={deleteClass} className="class-delete">
          <input type="hidden" name="classId" value={c.id} />
          <button type="submit" className="class-remove">
            Remove {c.name} and its history
          </button>
        </form>
      </div>
    </details>
  );

  const activeMark = (c: { id: string; groupType?: string | null }, isActive: boolean) =>
    isActive ? (
      <span className="class-active-mark">{isNonSchoolGroup(c.groupType) ? "active" : "teaching now"}</span>
    ) : (
      <form action={chooseClass}>
        <input type="hidden" name="classId" value={c.id} />
        <button type="submit" className="class-choose">
          Make active
        </button>
      </form>
    );

  return (
    <main className="classes">
      <AppNav />
      <h1>{collectionTitle}</h1>

      <p className="classes-intro">
        {classes.length === 0
          ? "Add a school class, your family or another group to keep its activity history."
          : solo
            ? t(`Your ${groupNoun(classes[0]?.groupType)}, and the place it uses.`)
            : t(includesNonSchool ? "Choose a group, or open the place it uses." : "Choose the class you are teaching, or open the place it uses.")}
      </p>

      {solo &&
        classes.map((c) => {
          const place = places.get(placeKeyOf.get(c.id) ?? "");
          const isActive = active?.id === c.id;
          const locale = resolveLocale(localeOverride ?? c.englishLocale ?? undefined, place ?? c);
          const band = bandForYearGroup(c.yearGroup);
          const level = c.ageRange ? `Ages ${c.ageRange}` : band ? abilityLabel(band, locale) : c.yearGroup;
          return (
            <ul key={c.id} className="class-list">
              <li className={isActive ? "class-card active" : "class-card"}>
                <div className="class-line">
                  <h2 className="class-name">{c.name}</h2>
                  {activeMark(c, isActive)}
                </div>
                <span className="class-meta">{level}</span>
                <span className="class-tally">{tallyLine(c.id, isActive)}</span>
                {place && (
                  <PlaceBlock place={place} anchorClassId={c.id}>
                    <div className="class-line">{placeChip(c, place)}</div>
                  </PlaceBlock>
                )}
                <div className="class-line">{settings(c)}</div>
              </li>
            </ul>
          );
        })}

      {!solo && classes.length > 0 && (
        <section className="classes-section" aria-labelledby="classes-list-title">
          <h2 id="classes-list-title" className="classes-section-title">
            {includesNonSchool ? "Groups" : "Classes"}
          </h2>
          <ul className="class-list">
            {classes.map((c) => {
              const isActive = active?.id === c.id;
              const place = places.get(placeKeyOf.get(c.id) ?? "");
              const locale = resolveLocale(localeOverride ?? c.englishLocale ?? undefined, place ?? c);
              const band = bandForYearGroup(c.yearGroup);
              const level = c.ageRange ? `Ages ${c.ageRange}` : band ? abilityLabel(band, locale) : c.yearGroup;
              return (
                <li key={c.id} className={isActive ? "class-card active" : "class-card"}>
                  <div className="class-line">
                    <h3 className="class-name">{c.name}</h3>
                    {activeMark(c, isActive)}
                  </div>
                  <span className="class-meta">{level}</span>
                  {/* The north-star number, in Today's exact words for the
                      active class (#341) and with the session count for the
                      others, because this is where a teacher compares them. */}
                  <span className="class-tally">{tallyLine(c.id, isActive)}</span>
                  <div className="class-line">
                    {/* The chip is the relationship, and the one door to the
                        place page: it opens it as this class. */}
                    {placeChip(c, place)}
                    {settings(c)}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!solo && placeList.length > 0 && (
        <section className="classes-section" aria-labelledby="places-list-title">
          <h2 id="places-list-title" className="classes-section-title">
            {t("Places")}
          </h2>
          <ul className="class-list">
            {placeList.map((place) => {
              // The class the location control writes through: the one
              // being taught if it is here, else the first linked.
              const anchor =
                place.classes.find((linked) => linked.id === active?.id) ??
                place.classes[0];
              if (!anchor) return null;
              const isActiveHere = place.key === activePlaceKey;
              return (
                <li
                  key={place.key}
                  id={place.key}
                  className={isActiveHere ? "place-card active" : "place-card"}
                >
                  <PlaceBlock place={place} anchorClassId={anchor.id}>
                    <h3 className="place-name">{place.name}</h3>
                    <p className="place-used">
                      Used by{" "}
                      <strong>{listNames(place.classes.map((linked) => linked.name))}</strong>
                    </p>
                  </PlaceBlock>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <form action={createClass} className="class-new">
        <h2>{classes.length === 0 ? "Add your first group" : "Add another group"}</h2>
        <GroupFields defaultType={active?.groupType} />
        {/* Where it goes out (#913, #905): an existing place, or somewhere
            new named by its school. The School box only shows for the
            latter. */}
        {realPlaces.length > 0 ? (
          <NewClassPlace
            label={t("Place")}
            options={realPlaces.map((place) => ({
              id: place.groundsId ?? "new",
              name: place.name,
            }))}
            defaultId={
              realPlaces.find((place) => place.key === activePlaceKey)?.groundsId ??
              realPlaces[0]?.groundsId ??
              "new"
            }
          />
        ) : (
          <label className="signin-label">
            Place name
            <input
              className="signin-input"
              name="school"
              required
              maxLength={120}
              placeholder="e.g. School garden or local park"
            />
          </label>
        )}
        <button type="submit" className="signin-submit">
          Add group
        </button>
      </form>

      {active && (
        <p className="classes-foot">
          <Link href="/journal">See {active.name}&rsquo;s journal →</Link>
        </p>
      )}

      {/* The way in to the vocabulary match (#563). Here rather than on
          /season because this is where a teacher plans rather than teaches,
          and because /season's signed-out shape is still being designed
          (#922). A matcher nothing links to does not reach the teacher it
          was built for. */}
      <p className="classes-foot">
        <Link href="/vocabulary">Match your key vocabulary to our sessions →</Link>
      </p>

      {/* Temporary while real teachers test (#644): settings is where a
          teacher goes looking for a way to say something. */}
      <p className="classes-foot">
        <Link href="/feedback">Send feedback →</Link>
      </p>
    </main>
  );
}
