import { Wordmark } from "@/app/Wordmark";
import { requestLocale } from "@/lib/request-locale";
import { notFound } from "next/navigation";
import { abilityLabel, resolveAbility } from "@/lib/ability";
import { localizeDeep } from "@/lib/localization";
import { canonicalSessionId, findSession, leadPack } from "@/lib/pack";
import { activePlaceContext, sessionForPlace } from "@/lib/place-context";
import { PrintPhase } from "@/engine/print-phase";
import { carriesNothing, NOTHING_TO_CARRY } from "@/lib/kit";
import { renderChildSheet, sheetFolioLine } from "@/engine/sheet-templates";
import { standardsSystemNames } from "@/schema/pack";
import { groupStandardsCitations } from "@/lib/standards";
import {getActiveClass, getTeacher, getActiveClassLocation } from "@/lib/teacher";
import { readSurfaceCast } from "@/lib/cast/surface";
import { primaryTopicOf } from "@/lib/lesson/door";
import { PrintButton } from "./PrintButton";
import { MayMeetStrip } from "./CastCards";
import { FlashCards } from "./FlashCards";
import { PreparedFor } from "./PreparedFor";
import { preparedForFolio } from "@/lib/prepared-day/prepared-for";
import { preparationStore } from "@/lib/prepared-day/store";

/**
 * The teacher A4 one-pager: the whole session walked by the print registry.
 * Same pack data as / and /run — this page is just another renderer of it.
 * Print it and the session works with no device at all.
 */
export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    session?: string;
    locale?: string;
    part?: string;
    size?: string;
    prepared?: string;
  }>;
}) {
  // A bare /print with no session named falls back to the pack the shelf is
  // currently leading with, not a hardcoded season.
  const home = leadPack();
  const {
    session: wanted,
    locale: localeParam,
    part,
    size,
    prepared: preparedId,
  } = await searchParams;
  const found = wanted ? findSession(wanted) : { pack: home, session: home.sessions[0] };
  if (!found?.session) notFound();
  const pack = found.pack;
  // The canonical id, and the one every link and folio index is keyed on. The
  // saved snapshot below may carry a since-retired one.
  const sessionId = found.session.id;
  const locale = await requestLocale(localeParam, await getActiveClassLocation());

  // Signed in, the sheet's masthead names the class's own school — the place
  // line the schema left optional for exactly this. Signed out it stays the
  // neutral demo sheet.
  const teacher = await getTeacher();
  const active = teacher ? await getActiveClass(teacher.id) : null;

  /**
   * WHICH PREPARATION THIS SHEET IS OF, when it is of one (#1092).
   *
   * A sheet printed straight from the pack was prepared for nothing in
   * particular and says nothing; a sheet printed from a saved preparation says
   * which day and which sky it was made for. The id rides in the URL beside
   * `part` and `size`, on the same posture as those: following the link is the
   * choice.
   *
   * Two guards, and neither is decoration. The store takes the teacher on
   * every read, so one teacher's id cannot label another's paper. And the
   * preparation must be OF the session being printed — a mismatch would put a
   * Thursday rain morning at the top of a different lesson, which is precisely
   * the confusion this line exists to end.
   *
   * The stored id goes through `canonicalSessionId` because it came off a
   * database row rather than off a live `Session`: a session renamed since the
   * preparation was saved would otherwise fail this equality and drop the
   * notice silently, which is the one failure mode worse than not having built
   * it.
   */
  const preparation =
    teacher && preparedId
      ? await preparationStore.read(teacher.id, preparedId)
      : null;
  const prepared =
    preparation && canonicalSessionId(preparation.source.id) === sessionId
      ? preparation
      : null;
  const preparedContext = prepared?.context ?? null;

  /**
   * A TAUGHT DAY NEVER CHANGES, which is why this renders the source the
   * preparation FROZE rather than whatever the pack says now.
   *
   * `schema/prepared-day.ts` states it of the record: "A day that renders from
   * whatever the pack says TODAY is a day that changes after it was approved."
   * The same is true of the paper. Without this, an author's edit to the kit or
   * the safety wording after a preparation was saved would print under that
   * preparation's date and sky — one sheet carrying two revisions, with the
   * notice at the top vouching for both.
   */
  const authored = prepared ? prepared.source : found.session;
  // Habitat before localization, as on /read and in lesson-data.ts: the seam
  // picks the instruction for this school's pack key, localization puts the
  // surviving sentence into the reader's English (#207, #265).
  const session = localizeDeep(await sessionForPlace(authored, await activePlaceContext()), locale);

  const homeHref = teacher ? "/today" : "/";
  const homeLabel = teacher ? "Back to today" : "Back to Nature Class";
  // The band the preparation was made at outranks the class row, through the
  // resolver's own `preparation` precedence. A class regraded — or a teacher
  // who switched active class — after saving must not reword a prepared sheet
  // underneath its own prepared-for line.
  const classBand = resolveAbility({
    preparationBand: preparedContext?.ability.band ?? null,
    classBand: active?.abilityBand,
    yearGroup: active?.yearGroup,
  }).band ?? undefined;
  const classLevel = active && classBand ? abilityLabel(classBand, locale) : null;
  // Same grouping as the primer, from the one place that defines it.
  const standards = groupStandardsCitations(session.standards ?? []);

  const childSheet = session.childSheet.map((block) =>
    block.type === "sheet-title" && !block.place && active
      ? { ...block, place: `at ${active.school}` }
      : block
  );

  // The same cast the speak-and-show held up outside, in the same order.
  // That is what makes "shown cards are printed cards" a true sentence rather
  // than a nice one — see `lib/cast/resolve.ts`'s `topicFilter` (nc#233).
  // STRICTLY topic-filtered, so a minibeast day prints minibeasts and nothing
  // else, rather than minibeasts topped up with whatever else was recorded.
  const { cast, located, place } = await readSurfaceCast({
    topicTags: session.topicTags,
    primaryTopic: primaryTopicOf(session),
    topicFilter: true,
    limit: 6,
  });

  /**
   * Which piece of the bundle to print. Johan: "Print   script childs notes
   * option".
   *
   * Reaching paper used to cost three nested labels — "Paper, if you want it"
   * then "What is in the print bundle" then the button — and then printed
   * everything regardless. Now the choice is the page, and the piece she
   * picked is the only thing on paper. Still no checkboxes and no selection to
   * submit: following the link IS the choice, and the OS print dialog is
   * already the confirmation.
   */
  /**
   * `flashcards` is the fifth line and the second one that is hers rather than
   * the children's (#757). It prints the beats, the words she says and the
   * cues she is hunting, at a size that survives being clipped to a lanyard —
   * The first real teacher, 2026-08-31: "might like more flashcards to clip and have
   * as reminders." It is always offered, because a session always has a title,
   * a length and at least one phase; what varies is how thick the deck is.
   */
  const parts = ["script", "sheets", "flashcards", "all"] as const;
  // Existing reference-card links open the activity sheet while references are paused.
  const chosen = part === "cards" ? "sheets" : (parts as readonly string[]).includes(part ?? "")
    ? (part as (typeof parts)[number])
    : "all";
  const show = (piece: (typeof parts)[number]) => chosen === "all" || chosen === piece;

  /**
   * HOW BIG A CARD IS, which is the deck's only real choice (see
   * `docs/concepts/nature-class-print-tabs-and-deck-2026-09-02.html`).
   *
   * Johan, 2026-09-02: "for flashcards do both sizes maybe? half page and full
   * page." So both print, and the size rides in the URL beside the piece —
   * same posture as `part`, and for the same reason: following the link IS the
   * choice, and the OS print dialog is the confirmation.
   *
   * They are not one card at two scales. A HALF is a thing she reads to
   * herself, punched and clipped and carried; a FULL is a thing she holds up
   * to thirty children, at a size that reads across a circle. The sheet says
   * which one it is in its own masthead rather than making the tab lie.
   *
   * Half is the default because it is the artefact the teacher actually asked for —
   * "flashcards to clip and have as reminders" — and because it is the one
   * that survives a lanyard. The full sheet is the one nobody has asked for
   * yet; it is offered, not led with.
   */
  const sizes = ["half", "full"] as const;
  const deckSize = (sizes as readonly string[]).includes(size ?? "")
    ? (size as (typeof sizes)[number])
    : "half";
  // The size travels with every tab, so choosing full and then stepping out to
  // the script and back does not silently drop her back to half. The
  // preparation travels the same way and for a sharper reason: a tab that lost
  // it would hand back the same-looking sheet with the prepared-for line gone,
  // and a sheet that has stopped saying what it was made for is the failure
  // #1092 is about. Carried only when it named a preparation of this session.
  const carried =
    preparedContext && preparedId ? `&prepared=${encodeURIComponent(preparedId)}` : "";
  const partHref = (next: (typeof parts)[number]) =>
    `?session=${sessionId}&part=${next}&locale=${locale}&size=${deckSize}${carried}`;
  const sizeHref = (next: (typeof sizes)[number]) =>
    `?session=${sessionId}&part=${chosen}&locale=${locale}&size=${next}${carried}`;

  return (
    <>
      {/* SCREEN ONLY, and it must never reach paper.
       *
       * TABS, because four documents shown one at a time is what a tab row is
       * for and the sheet below is already the tab's panel. The row shipped as
       * a wrap of outlined pills and Johan turned it down; the alternative —
       * anchor links down the side — is drawn and turned down in the sketch,
       * because a rail costs ~214px of width taken from the only element here
       * that cannot give width back, the A4 preview. It becomes the right
       * answer the day all four pieces sit on one scrolling page.
       *
       * "Back to today" and the print button sit on the line ABOVE the tabs so
       * the tab row is a clean rule edge to edge. */}
      <div className="print-bar">
        <div className="print-bar-top">
          <a className="print-back" href={homeHref}>
            {homeLabel}
          </a>
          <PrintButton />
        </div>
        <nav className="print-tabs" aria-label="What to print">
          <a href={partHref("script")} aria-current={chosen === "script"}>
            The script
          </a>
          <a href={partHref("sheets")} aria-current={chosen === "sheets"}>
            The children&rsquo;s sheets
          </a>
          {/* The tab names what is actually in it. At full page these are not
              cards to clip — a 297mm sheet does not go on a lanyard — and a
              tab that said so while the sheet below said otherwise would be
              the label lying about its own panel. */}
          <a
            href={partHref("flashcards")}
            aria-current={chosen === "flashcards"}
          >
            {deckSize === "half" ? "Cards to clip" : "Cards to hold up"}
          </a>
          <a href={partHref("all")} aria-current={chosen === "all"}>
            Everything
          </a>
        </nav>

        {/* The deck's own choice, and only the deck's, so it is subordinate to
            the tabs rather than a sixth one: tabs choose the document, this
            chooses the paper it is cut from. It appears only where it applies —
            on the deck's tab, and on Everything, which contains the deck. */}
        {(chosen === "flashcards" || chosen === "all") && (
          <nav className="print-size" aria-label="How big the cards are">
            <a href={sizeHref("half")} aria-current={deckSize === "half"}>
              Half page, to clip and carry
            </a>
            <a href={sizeHref("full")} aria-current={deckSize === "full"}>
              Full page, to hold up
            </a>
          </nav>
        )}
      </div>
      {show("script") && (
      <main className="print-page">
        {/* One hierarchy, read top to bottom: the title, the facts that place
            it, then the objective as the lead statement, then its fuller
            description. The facts line used to carry the session's whole topic
            sentence inside a letterspaced caption, so a paragraph of prose was
            set in the register reserved for labels and wrapped across two
            lines against the title. Prose reads as prose; only the short
            factual line stays a caption. */}
        <header>
          <div className="print-masthead">
            <Wordmark seed className="print-logo" />
            <span>Teacher’s field guide</span>
          </div>
          <h1>{session.title}</h1>
          <p className="print-meta">
            {classLevel ? `${classLevel} · ` : ""}{session.durationMin} min · skill:{" "}
            {session.namedSkill}
          </p>
          <p className="print-objective">{session.objective}</p>
          {session.topic && <p className="print-topic">{session.topic}</p>}
          {/* THE PLAIN LABEL (#463). An Ohio teacher, a Vermont camp lead and
              an NC troop leader all rejected a printed pack that was reading
              a Canonbury sample patch and never said so. Paper carries no
              tooltip and no second screen, so the one place this can be said
              is on the sheet itself, once, plainly. Silent for a located
              class (this is already her own grounds) and silent when the
              geocoder named nothing at all. */}
          {!located && place.name && (
            <p className="print-place">
              Read for {place.name}, a sample patch. Not your own grounds.
            </p>
          )}

          {/* The same argument as the label above it, one field over: a rain
              plan carried into sun is the costliest trust failure we have, and
              paper cannot be asked what it was for. */}
          {preparedContext && (
            <PreparedFor
              context={preparedContext}
              freshness={prepared?.sourceFreshness?.state}
            />
          )}

        </header>

        {/* Some sessions carry nothing. A bare "Carry outside" heading over an
            empty list reads as a missing list rather than an empty one, so the
            zero case is a plain sentence: the session's own preparation line
            when it has one, the generic line otherwise. */}
        <section className="print-kit">
          {carriesNothing(session.kit) ? (
            <p className="print-nokit">{session.preparation ?? NOTHING_TO_CARRY}</p>
          ) : (
            <>
              <h2>Carry outside</h2>
              <ul>
                {session.kit.map((item) => (
                  <li key={item}>
                    <span className="box" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              {session.preparation && <p className="print-prep">{session.preparation}</p>}
            </>
          )}
        </section>

        {session.phases.map((phase, index) => (
          <PrintPhase key={phase.key} phase={phase} ability={classBand} number={index + 1} />
        ))}

        <aside className="print-curriculum" aria-label="Curriculum references">
          {standards.length > 0 && (
            <div className="print-standards">
              {standards.map((citation) => (
                <p key={`${citation.system}-${citation.code}`}>
                  <span className="print-standards-code">
                    {standardsSystemNames[citation.system]} · {citation.code}
                  </span>
                  {citation.texts.map((text) => (
                    <span className="print-standards-text" key={text}>
                      &ldquo;{text}&rdquo;
                    </span>
                  ))}
                </p>
              ))}
            </div>
          )}
        </aside>

        {/* Her own sheet gets names, not cards. She scans this with a coat in
            her hand; the pictures live on the children's sheet. */}
        <MayMeetStrip members={cast.members} located={located} placeName={place.name} />
      </main>
      )}

      {/* The child's sheet: a second A4, the session's own printable. Product
          law — every session ships its sheet. Same block model, its own
          registry, laid out by the template this session resolves to. The
          template layer degrades to the field card rather than fail, so this
          call cannot come back empty. */}
      {/* Her own clip-and-carry deck (#757). Reads the same session, the same
          band and the same cast the three pieces above read — it is a fourth
          walk of one set of data, not a second source of truth. */}
      {show("flashcards") && (
        <FlashCards
          session={session}
          band={classBand}
          size={deckSize}
          cast={cast.members}
          located={located}
          placeName={place.name}
          /* The same fact as the A4's notice above, in the millimetres a card
             has (#1245). The deck is the artefact that leaves the building on
             a lanyard, so it is the one most likely to be read days later with
             nothing beside it to check the sky against. Null when this is not
             a prepared day, and then the deck says nothing. */
          preparedFor={preparedContext ? preparedForFolio(preparedContext) : null}
        />
      )}

      {show("sheets") && renderChildSheet(session, {
        blocks: childSheet,
        ability: classBand,
        folio: {
          where: sheetFolioLine(
            pack.title,
            pack.sessions.findIndex((s) => s.id === sessionId)
          ),
        },
      })}
    </>
  );
}
