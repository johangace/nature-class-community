import { requestLocale } from "@/lib/request-locale";
import { localizeText } from "@/lib/localization";
import Link from "next/link";
import { SpeciesLearning } from "../SpeciesLearning";
import { notFound } from "next/navigation";
import { CastFace } from "@/app/CastFace";
import { readSurfaceCast } from "@/lib/cast/surface";
import { getSpeciesDepth } from "@/lib/cast/depth";
import { safetyFor } from "@/lib/cast/safety";
import { SAFETY_CHILD_LINE } from "@/lib/cast/member";
import { castMaterial, displayPhotoGallery, findBySlug, tierLabel } from "@/lib/cast/read";
import { ObservedCredit } from "@/app/ObservedCredit";
import { SpecimenStrip } from "@/app/SpecimenStrip";
import { topicTags as allowedTopicTags, type TopicTag } from "@/schema/pack";
import { getTeacher } from "@/lib/teacher";
import { findSession } from "@/lib/pack";
import { returnToRunHref } from "@/app/run/return-to-run";

/**
 * The species profile — the tap target, from the daily card and from the
 * in-lesson card both.
 *
 * Johan's steer on round 2: "I like species profiles when we click on them
 * rather than all info upfront." So the disclosure is three tiers and this is
 * the middle one. The face carries a photo, a name, one line and its tier.
 * This carries the evidence. Anything unproven carries silence.
 *
 * ONE SCROLLING COLUMN, in this order, and the order is the argument:
 *
 *   1. the portrait, with the name, the line and the tier ON the image
 *   2. what it is — the creature itself, and what it does
 *   3. children found before — REAL dated photos, or the row does not exist
 *   4. look-don't-touch — only when the species has a safety note
 *   5. for the teacher — one thing worth knowing, lowest
 *
 * ── THE PROVENANCE PARAGRAPH IS GONE (2026-08-18) ──────────────────────────
 *
 * There used to be a "how we know" strip above everything, carrying the
 * honesty sentence: the recording window, the count of different years, the
 * usual number logged in a window like this one, and on the signed-out demo a
 * line saying this is the sample patch. Johan struck it: "pls remove the
 * extensive disclaimers in these cards they are redundant and anoying... they
 * dont need to know everything make it more fun stop obsesing on what was
 * recorded."
 *
 * The honesty did not leave with it. It moved to where it was always the
 * strongest: the TIER CHIP on the image, two or three words, unmissable, and
 * impossible to screenshot away from the picture it qualifies. What went was
 * the paragraph restating the chip in numbers nobody asked for. A page that
 * argues its own evidence three times is not more honest than a page that
 * labels it once, it is just harder to read outside.
 *
 * Teacher depth sits at the BOTTOM deliberately. She opens this with thirty
 * children waiting; the thing she needs in that moment is the picture and the
 * one true sentence about it. The background for her own understanding is
 * worth having and worth scrolling for, and putting it above the photograph
 * would make the surface a reference page instead of a thing to hold up.
 *
 * ── THE ROW THAT IS EMPTY ON DAY ONE ───────────────────────────────────────
 *
 * "Children found these before" is the richest element on this page and it is
 * EMPTY at every pilot school on day one — there is no history yet, and it
 * grows in over a term. It is omitted entirely rather than rendered as a
 * shell, because a headed empty row reads as a broken feature where no row at
 * all reads as a page that simply has nothing to say yet. The page must be
 * whole without it, and testing that it is whole without it matters more than
 * testing it with it: the empty version is the one a teacher judges the
 * product by.
 *
 * There is no upload path yet, so this row is silent everywhere today. It is
 * built rather than deferred so that the day child photographs exist, the
 * wiring is a query and not a new surface.
 */
export const dynamic = "force-dynamic";

export default async function SpeciesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ topic?: string | string[]; session?: string | string[]; locale?: string }>;
}) {
  const { slug } = await params;
  const teacher = await getTeacher();
  const query = await searchParams;
  const locale = await requestLocale(query?.locale);
  // Opened from a live lesson (#874): the way back is INTO that run, on the
  // beat she left, not out to Today. Only a session the shelf actually holds
  // earns the link; anything else keeps the ordinary way home.
  const rawSession = query?.session;
  const fromRun =
    typeof rawSession === "string" && findSession(rawSession)?.session ? rawSession : null;
  const homeHref = fromRun ? returnToRunHref(fromRun) : teacher ? "/today" : "/";
  const homeLabel = fromRun ? "Back to the lesson" : teacher ? "Today" : "Nature Class";
  const rawTopic = query?.topic;
  const profileTopic =
    typeof rawTopic === "string" &&
    (allowedTopicTags as readonly string[]).includes(rawTopic)
      ? (rawTopic as TopicTag)
      : null;

  // Replay a lesson's validated producer scope when its link carries one, then
  // protect this already-selected species from the resolver's eight-member
  // display cap. A topic-ranked lesson can legitimately link to a member that
  // a fresh generic cast never fetched or would place ninth; profileSlug keeps
  // that member only when today's scoped inputs still contain it.
  const { cast, place } = await readSurfaceCast({
    limit: 12,
    profileSlug: slug,
    primaryTopic: profileTopic,
    topicTags: profileTopic ? [profileTopic] : [],
  });
  const member = findBySlug(cast, slug);

  // A slug that is not in today's cast is a 404 rather than a lookup against
  // some global species table. This page is about what is near THIS school
  // today; a generic encyclopaedia entry for a creature nobody expects to meet
  // would be exactly the decorative nature content the cast contract exists to
  // keep out.
  if (!member) notFound();

  const material = castMaterial(member);
  // Element zero is the hero's own picture; `SpecimenStrip` drops it rather
  // than showing the same photograph twice under a different heading.
  const gallery = displayPhotoGallery(member);

  // Derived at render, not trusted from the row. A cast stored before the
  // safety module existed carries no safetyNote, so a hornet resolved last
  // week would show a profile with no look-don't-touch band at all. The
  // matcher is cheap and keyed on the scientific name, so asking it here means
  // an old stored cast is as safe as a fresh one. The stored note wins when
  // there is one: it is what the resolver actually decided for this class.
  const safetyNote = member.safetyNote ?? safetyFor(member.scientificName)?.note ?? null;

  // The child line follows the same derivation. Without this a hornet from an
  // old stored cast would show the safety band to the teacher and still hand
  // the class an ordinary "look for it" line, which is the wrong half of the
  // message reaching the wrong half of the room.
  const childFacing = safetyNote ? SAFETY_CHILD_LINE : member.line;
  // The observed leg (#959): a dated record or nothing. Same rule as the face.
  const observed = safetyNote ? null : (member.observed ?? null);

  // The depth Johan opens the profile expecting. Every sentence assembled from
  // a field the phenology or the cast member actually carries; absent, not
  // padded, when we have no entry for this species this week.
  const depth = await getSpeciesDepth({
    commonName: member.commonName,
    scientificName: member.scientificName,
    iconicTaxon: member.iconicTaxon,
    lat: place.lat,
    lng: place.lng,
    climate: place.climate,
  });
  const foundBefore: Array<{ id: string; url: string; when: string }> = [];

  return (
    <main className="species-page">
      <div className="species-topbar">
        <Link href={homeHref} className="species-back">
          <span aria-hidden="true">&larr;&ensp;</span>{homeLabel}
        </Link>
      </div>

      {/* The hero carries name, line and tier on the image itself, in all four
          honesty materials, so a screenshot of it cannot be read as a claim it
          does not make. */}
      <section className={`species-hero species-hero-${material}`}>
        <CastFace member={member} size="hero" />
        <div className="species-hero-cap">
          <h1 className="species-name">{member.commonName}</h1>
          {member.scientificName && (
            <p className="species-scientific">{member.scientificName}</p>
          )}
          {safetyNote && <p className="species-line">{childFacing}</p>}
          {observed && (
            <p className="species-observed">
              {observed}
              <ObservedCredit />
            </p>
          )}
          <span className="species-tier">{tierLabel(member)}</span>
        </div>
      </section>

      <section className="species-strip">
        <SpeciesLearning key={member.scientificName ?? member.commonName} commonName={member.commonName} scientificName={member.scientificName}
          initial={depth.forChildren && depth.credit ? { learning: {
            introduction: localizeText(depth.forChildren.introduction, locale, [member.commonName]),
            lookFor: localizeText(depth.forChildren.lookFor, locale, [member.commonName]),
            question: localizeText(depth.forChildren.question, locale, [member.commonName]),
          }, source: depth.credit } : null} />
      </section>

      {/* The other specimens, when there are any (#984). Directly under the
          portrait and above the prose, because "is this one?" is the question
          being asked at the moment this page opens — and silent for the
          ordinary member that has exactly one picture, which is most of them
          and is not a broken state. */}
      <SpecimenStrip photos={gallery} commonName={member.commonName} />

      {/* Omitted entirely when empty, which is everywhere today. Never a
          heading over nothing. */}
      {foundBefore.length > 0 && (
        <section className="species-found">
          <p className="species-k">children found these before</p>
          <ul className="species-photos">
            {foundBefore.map((photo) => (
              <li key={photo.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={`Found near this school, ${photo.when}`} loading="lazy" />
                <span className="species-photo-date">{photo.when}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* By relevance, never by template. Most species have no safety note and
          this band does not exist for them — a caution rendered every time is
          a caution nobody reads. */}
      {safetyNote && (
        <section className="species-safe">
          <span className="species-safe-dot" aria-hidden="true" />
          <p>{safetyNote}</p>
        </section>
      )}

      {/* One thing worth knowing when a class meets it. Absent when neither
          the article nor the phenology answered, because a heading over
          nothing reads as a broken feature.

          What used to sit here was a paragraph explaining why this species was
          on her list at all, and Johan struck it on 2026-08-18: "this is wrong
          stop giving so much clarification... we dont need to explain
          everything". The honesty argument is already made twice above, on the
          tier chip on the image. This section is hers to learn something
          from. */}
      {(depth.whatItIs || depth.rightNow || depth.forTeacher) && (
        <details className="species-depth">
          <summary>For the teacher</summary>
          {depth.whatItIs && <p>{localizeText(depth.whatItIs, locale, [member.commonName, member.scientificName ?? ""])}</p>}
          {depth.rightNow && <p>{depth.rightNow}</p>}
          {depth.forTeacher && <p>{localizeText(depth.forTeacher, locale, [member.commonName, member.scientificName ?? ""])}</p>}
          {depth.credit && (
            <p className="species-credit">
              From{" "}
              <a href={depth.credit.url} target="_blank" rel="noreferrer noopener">
                {depth.credit.title}
              </a>{" "}
              on Wikipedia, CC BY-SA.
            </p>
          )}
        </details>
      )}
    </main>
  );
}
