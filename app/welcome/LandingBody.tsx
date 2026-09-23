import { localizeDeep, type Locale } from "@/lib/localization";
import { localeHref } from "@/lib/locale-links";
import { landingText } from "./landing-copy";
import { LessonMenuPreview } from "./LessonMenuPreview";
import Image from "next/image";
import { SayAloudBlock } from "@/engine/renderers/say-aloud";
import { TeacherNoteBlock } from "@/engine/renderers/teacher-note";
import Link from "next/link";
import { landingLesson as sourceLesson, landingScriptPhase as sourcePhase } from "./landing-lesson";
import styles from "./Landing.module.css";
import { PreparationGlyph, type PreparationGlyphName } from "@/app/session/PreparationGlyph";
import { AssistantGlyph } from "@/app/AssistantGlyph";
import { cardConditionFromBucket } from "@/lib/cast/conditions";

/**
 * The public landing below the hero (#914).
 *
 * Order follows a visitor's questions: how does it work, what does the day
 * change, what does it change in the class, what do I get, is it real, can
 * my school use it, can I trust it. Every lesson line on the page is read
 * from the authored autumn pack in landing-lesson.ts, never retyped here, and
 * every feature and every weather note names only what shipped code does.
 */

const outcomes = [
  [
    "Calmer classrooms",
    "Teachers report better focus and less disruption in the hours after a session. The regulation carries back inside.",
  ],
  [
    "Children who struggle indoors thrive outside",
    "Sensory, kinaesthetic and neurodiverse learners often come alive in nature. The outdoor space meets them where they are.",
  ],
  [
    "Connection that compounds",
    "Week after week, children build a relationship with the land around their school.",
  ],
] as const;

/**
 * Three mornings, three notes. Each card shows the one line the daily card
 * really gives the teacher for that weather (lib/cast/conditions ADJUSTMENTS,
 * read here and never retyped), and nothing more. Nothing here shortens a
 * lesson, adds pauses or routes the class: duration, order, kit and safety
 * are authored and fixed.
 */
const weatherDoorways = [
  {
    place: "London",
    season: "Autumn",
    condition: "Rain",
    bucket: "wet",
    image: "/landing/nature-intelligence-london-autumn.png",
    alt: "A child-style painting of a rainy park with autumn trees, an umbrella and a clock tower in the distance",
  },
  {
    place: "Los Angeles",
    season: "Spring",
    condition: "Full sun",
    bucket: "hot",
    image: "/landing/nature-intelligence-los-angeles-spring.png",
    alt: "A child-style painting of a sunny flower meadow with bees, a red sun, green hills and a small house",
  },
  {
    place: "Vermont",
    season: "Winter",
    condition: "Snow",
    bucket: "cold",
    image: "/landing/nature-intelligence-vermont-winter.png",
    alt: "A child-style painting of a snowy mountain scene with evergreens, a red house, animal tracks and painted animals",
  },
] as const;

/**
 * What a teacher gets, feature then benefit, every line true of shipped code.
 * The glyph on each card is the app's own (session/PreparationGlyph, the
 * assistant's sparkle), so the landing shows the marks the product uses.
 */
const features: ReadonlyArray<{
  title: string;
  benefit: string;
  glyph: PreparationGlyphName | "assistant";
}> = [
  {
    title: "A fully prepared lesson",
    benefit:
      "Learning objectives, glossary, teacher’s notes and the hazards for your region and month. A few minutes of reading and you are ready.",
    glyph: "primer",
  },
  {
    title: "A teleprompter on your tablet or phone",
    benefit:
      "One line at a time, with a timer, and it resumes where you stopped. Look at the children, glance down for the next line.",
    glyph: "tablet",
  },
  { title: "Play aloud", benefit: "Tap any spoken line and the lesson says it for you.", glyph: "preview" },
  {
    title: "An interactive children’s board",
    benefit:
      "Pictures of what is living in your region this week, with a line to read out, for the class to gather round.",
    glyph: "life",
  },
  {
    title: "Teacher’s assistant",
    benefit:
      "AI that knows this lesson. Make it simpler, add movement, add challenge, or type a child’s question and get an answer you can say back.",
    glyph: "assistant",
  },
  {
    title: "A print pack",
    benefit: "The script on A4, the child’s sheet, cards to clip to yourself and cards to hold up.",
    glyph: "print",
  },
  {
    title: "Lessons mapped to your curriculum objectives",
    benefit: "National Curriculum and NGSS links, printed on the script.",
    glyph: "standards",
  },
  {
    title: "Circle time and minutes outside",
    benefit:
      "Close the lesson with the children’s reflections, and log the minutes outside per class, per term. One number for your school.",
    glyph: "clock",
  },
];

/** The people behind it, one line each, nothing the page cannot stand behind. */
const makers = [
  {
    role: "Created by",
    name: "Rewyld",
    href: "https://rewyld.earth",
    line: "Nature Class is made by Rewyld, a nature technology company helping people learn from and connect with the living world.",
  },
  {
    role: "Educational expertise by",
    name: "Plantenvironment",
    href: "https://plantenvironment.org.uk",
    line: "More than twenty years of hands-on urban environmental education.",
  },
  {
    role: "Supported by",
    name: "Assembly Code",
    href: "https://www.assemblycode.org",
    line: "A nonprofit incubator and steward for public interest software. Nature Class was built in its first cohort, 2026.",
  },
] as const;

/** Who already teaches outside and could bring their programme in. */
const partnerKinds = [
  "Forest school",
  "Outdoor training programmes",
  "Scouts and guides",
  "Holiday camps",
  "Bushcraft",
  "Farm and wildlife visits",
  "Nature reserves",
  "Museums and gardens",
  "Environmental charities",
] as const;

function Formula({ large = false }: { large?: boolean }) {
  return (
    <p className={large ? `${styles.formula} ${styles.formulaLarge}` : styles.formula}>
      <span className={styles.srOnly}>
        Your place + The season + Today’s weather + What is living here = Today’s lesson
      </span>
      <span aria-hidden="true" className={styles.formulaVisual}>
        <span className={styles.formulaInput}><PreparationGlyph name="place" />Your place</span>
        <span className={styles.formulaOp}>+</span>
        <span className={styles.formulaInput}><PreparationGlyph name="season" />The season</span>
        <span className={`${styles.formulaOp} ${styles.formulaBridge}`}>+</span>
        <span className={styles.formulaInput}><PreparationGlyph name="sun" />Today’s weather</span>
        <span className={styles.formulaOp}>+</span>
        <span className={styles.formulaInput}><PreparationGlyph name="life" />What is living here</span>

        <strong>= Today’s lesson</strong>
      </span>
    </p>
  );
}

export function LandingBody({ signedIn = false, locale = "uk", automatic = false }: { signedIn?: boolean; locale?: Locale; automatic?: boolean } = {}) {
  const t = (text: string) => landingText(text, locale);
  const landingLesson = localizeDeep(sourceLesson, locale);
  const landingScriptPhase = localizeDeep(sourcePhase, locale);

  return (
    <>

      <section className={`${styles.shell} ${styles.how}`} id="how-it-works" aria-labelledby="how-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>How it works</p>
            <h2 id="how-title" className={`${styles.sectionTitle} ${styles.howTitle}`}>
              Ready to lead, <span>in three steps.</span>
            </h2>
          </div>
          <p className={styles.sectionLead}>
            Preview your lesson, introduce it to the class, then head outside together.
          </p>
        </div>

        <ol className={styles.steps}>
          <li className={styles.step}>
            <div className={styles.stepCopy}>
              <div className={styles.stepEyebrow}><PreparationGlyph name="conditions" size={24} /><span>Step 1</span></div>
              <h3>Preview a lesson adapted for today.</h3><p>Hyperlocal outdoor learning, shaped by your location, the season, the weather and the life nearby. See what’s planned before you begin.</p>
            </div>
            <div className={styles.stepPreparation}>
              <figure className={styles.menuScreenshot}>
                <LessonMenuPreview locale={locale} automatic={automatic} />
                <figcaption>The lesson menu</figcaption>
              </figure>
              <div className={styles.stepMask}><Image src="/landing/animal-mask-template.svg" alt="A child’s printable animal mask, ready to decorate with leaves" width={840} height={594} /></div>
            </div>
          </li>
          <li className={styles.step}>
            <div className={styles.stepCopy}>
              <div className={styles.stepEyebrow}><PreparationGlyph name="preview" size={24} /><span>Step 2</span></div>
              <h3>Introduce the lesson.</h3><p>Bring the class into the story with pictures, questions and a shared activity. The interactive guide gives you words to start and prompts that invite children to join in.</p>
            </div>
            <div className={styles.classPreview}>
            <div className={styles.dayPreview}>
              <p className={styles.previewLabel}>An example day in London</p>
              <div className={styles.conditionChips}>
                <span><PreparationGlyph name="place" size={20} />London</span>
                <span><PreparationGlyph name="season" size={20} />{t("Autumn")}</span>
                <span><PreparationGlyph name="rain" size={20} />Rain</span>
                <span><PreparationGlyph name="life" size={20} />Life nearby</span>
              </div>
              <div className={styles.dayLesson}>
                <p>A lesson for this day</p>
                <h4>{landingLesson.title}</h4>
                <p>{landingLesson.question}</p>
                <p className={styles.dayLessonMeta}>Outside · {landingLesson.durationMin} minutes</p>
              </div>
            </div>
              <div className={styles.classPreviewPhotos}>
              <div className={styles.stackedLessonPreview}>
                <Image src="/landing/species-robin.jpg" alt="Robin, one of the living things children can look for" width={120} height={100} />
                <p>Lesson preview</p>
                <strong>{landingLesson.title}</strong>
              </div>
                <figure className={styles.stackedLessonPreview}>
                  <Image src="/landing/species-oak.jpg" alt="An oak tree for the class to look at together" width={240} height={200} />
                  <figcaption>Oak · <a href="/landing/README.md">Image sources</a></figcaption>
                </figure>
              </div>
            </div>
          </li>
          <li className={styles.step}>
            <div className={styles.stepCopy}>
              <div className={styles.stepEyebrow}><PreparationGlyph name="door" size={24} /><span>Step 3</span></div>
              <h3>Run it outside. Done.</h3><p>The words and teacher’s notes are there when you need them. Follow the prompts and explore together.</p>
              <p className={styles.tabletNote}>Works exceptionally well on your tablet.</p>
            </div>
            <div className={styles.outsideExample}>
              <div className={styles.outsideLesson}>
                <p className={styles.outsideExampleLabel}>Outside <span>{landingScriptPhase.title}</span></p>
                <p className={styles.outsideLessonName}>{landingLesson.title}</p>
                {landingScriptPhase.blocks.filter(block => block.type === "say-aloud").map((block, index) => block.type === "say-aloud" ? <SayAloudBlock key={index} block={block} ability="y2" /> : null)}
                {landingScriptPhase.blocks.filter(block => block.type === "teacher-note").map((block, index) => block.type === "teacher-note" ? <TeacherNoteBlock key={index} block={block} ability="y2" /> : null)}
              </div>
              <div className={`${styles.photo} ${styles.outsidePhoto} ${styles.cutFour}`}>
                <Image src="/landing/children-exploring-outside.png" alt="Children looking closely at plants and grass outdoors, one holding a magnifying glass" fill sizes="(max-width: 760px) 80vw, 40vw" />
              </div>
            </div>
          </li>
        </ol>
      </section>

      <section className={styles.intelligence} aria-labelledby="intelligence-title">
        <div className={styles.shell}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>Rain or shine</p>
              <h2 id="intelligence-title" className={styles.sectionTitle}>
                Every lesson, adapted for today.
              </h2>
            </div>
            <p className={styles.sectionLead}>{t("What is living in your region this week, the habitats your grounds have, today’s conditions and the safety guide for your region and month all go into the lesson. The words, the order and the time stay the same, so you always know what you are leading. ")}</p>
          </div>
          <Formula large />
          <p className={styles.tripLead}>Three mornings, three notes for the teacher:</p>
          <ul aria-label="Seasonal Nature Intelligence examples" className={styles.weatherDoorways}>
            {weatherDoorways.map(({ place, season, condition, bucket, image, alt }) => (
              <li key={place} data-weather={condition}>
                <div className={styles.weatherImage}>
                  <Image alt={t(alt)} fill sizes="(max-width: 760px) 90vw, 33vw" src={image} />
                </div>
                <div className={styles.weatherDoorwayCopy}>
                  <p className={styles.chipRow}>
                    <span className={`${styles.chip} ${styles.placeChip}`}><PreparationGlyph name="place" size={16} />{place}</span>
                    <span className={`${styles.chip} ${styles.seasonChip}`}><PreparationGlyph name="season" size={16} />{t(season)}</span>
                    <span className={`${styles.chip} ${styles.weatherChip}`}><PreparationGlyph name={condition === "Snow" ? "snow" : condition === "Rain" ? "rain" : "sun"} size={16} />{condition}</span>
                  </p>

                  <h3>{t(cardConditionFromBucket(bucket)?.adjustment ?? "")}</h3>
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.intelligenceFoot}>
            <Link className={styles.paperAction} href={localeHref("/start", locale, automatic)}>
              Try today’s lesson for your school <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.open}`} aria-labelledby="open-title">
        <p className={styles.kicker}>Free, open and private</p>
        <h2 id="open-title" className={styles.sectionTitle}>
          Free to use. Open source. Private by design.
        </h2>
        <div className={styles.openColumns}>
          <div>
            <h3>Free for teachers</h3>
            <p>{t("No card, no trial clock. An email address is the whole account, and the lesson for your grounds is ready. ")}</p>
          </div>
          <div>
            <h3>An open source project</h3>
            <p>
              The teacher runtime is AGPL-licensed. Anyone can read how a lesson is chosen and
              what the app does with what you type.
            </p>
          </div>
          <div>
            <h3>No child accounts</h3>
            <p>
              There are no child accounts and no child profiles. Your class’s location is used
              for the weather, the season and what is living in your region. Nothing else.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.offer} id="what-you-get" aria-labelledby="offer-title">
        <div className={styles.shell}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>What you get</p>
              <h2 id="offer-title" className={styles.sectionTitle}>
                Every lesson is prepared. <span>You lead it.</span>
              </h2>
            </div>
            <p className={styles.sectionLead}>{t("A term of outdoor lessons for your class, written to be led by a class teacher with no nature training. And the things around the lesson that make it work on a wet Tuesday. ")}</p>
          </div>
          <ul className={styles.offerList}>
            {features.map(({ title, benefit, glyph }) => (
              <li key={title}>
                <span className={styles.offerGlyph} aria-hidden="true">
                  {glyph === "assistant" ? (
                    <AssistantGlyph size={22} />
                  ) : (
                    <PreparationGlyph name={glyph} size={22} />
                  )}
                </span>
                <strong>{t(title)}</strong>
                <span>{t(benefit)}</span>
              </li>
            ))}
          </ul>

          <div className={styles.offerFoot}>
            <Link className={styles.paperAction} href={localeHref("/season", locale, automatic)}>
              Browse the curriculum <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.belief}`} aria-labelledby="belief-title">
        <div className={`${styles.photo} ${styles.cutTwo} ${styles.beliefPhoto}`}>
          <Image
            alt={t("A tyre swing hanging from a tree beside a den made from branches")}
            fill
            sizes="(max-width: 760px) 100vw, 46vw"
            src="/landing/tyre-swing-den.jpg"
          />
        </div>
        <div>
          <p className={styles.kicker}>What it changes</p>
          <h2 id="belief-title" className={styles.sectionTitle}>
            What half an hour outside does for a class.
          </h2>
          <ul className={styles.outcomeRail}>
            {outcomes.map(([title, body]) => (
              <li key={title}>
                <strong>{t(title)}</strong>
                <span>{t(body)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.close}`} aria-labelledby="close-title">
        <div className={styles.closeBand}>
          <div>
            <p className={styles.kicker}>Ready when the class is</p>
            <h2 id="close-title">Ready to take your class outside?</h2>
            <p>{t("Free for teachers. The lesson for your grounds is ready today.")}</p>
          </div>
          <Link className={styles.lightAction} href={localeHref(signedIn ? "/today" : "/start", locale, automatic)}>
            {signedIn ? "Open today’s lesson" : "Start with today’s lesson"}{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
      {/* Two doors, named plainly (Johan, 2026-09-14): the card's headline says who
          it is for, the promise sits under it in a larger lead, then one line and
          the way in. The detail lives on the audience pages. */}
      <section className={`${styles.shell} ${styles.audiences}`} id="for-schools" aria-labelledby="audiences-title">
        <p className={styles.kicker}>Who it’s for</p>
        <h2 id="audiences-title" className={styles.sectionTitle}>Nature Class for schools and families.</h2>
        <div className={styles.audienceCards}>
          <article className={`${styles.audienceCard} ${styles.audienceSchools}`} aria-labelledby="audience-schools">
            <div className={styles.audiencePhoto}>
              <Image
                alt={t("A circular bird’s nest space woven from branches with painted log seats")}
                fill
                sizes="(max-width: 760px) 100vw, 44vw"
                src="/landing/birds-nest-circle.jpg"
              />
            </div>
            <div className={styles.audienceCopy}>
              <h3 id="audience-schools" className={styles.audienceName}>For schools</h3>
              <p className={styles.audiencePromise}>Make nature part of everyday school life.</p>
              <p>{t("Prepared lessons every teacher can lead on your own grounds, with minutes outside recorded by class and term.")}</p>
              <Link className={styles.audienceAction} href={localeHref("/schools", locale, automatic)}>
                Explore Nature Class for schools <span aria-hidden="true">→</span>
              </Link>
            </div>
          </article>
          <article id="for-parents" className={`${styles.audienceCard} ${styles.audienceParents}`} aria-labelledby="audience-parents">
            <div className={styles.audiencePhoto}>
              <Image
                alt="Adults and children exploring plants together in a raised garden bed"
                fill
                sizes="(max-width: 760px) 100vw, 44vw"
                src="/landing/family-garden-london.webp"
              />
            </div>
            <div className={styles.audienceCopy}>
              <h3 id="audience-parents" className={styles.audienceName}>For parents</h3>
              <p className={styles.audiencePromise}>See nature through their eyes.</p>
              <p>Lesson plans, background notes and pictures for a park, a street tree or your garden. You learn alongside them.</p>
              <Link className={styles.audienceAction} href={localeHref("/parents", locale, automatic)}>
                Explore Nature Class for parents <span aria-hidden="true">→</span>
              </Link>
            </div>
          </article>
        </div>
      </section>

      {/* Outdoor educators come after the teacher's last call: a quieter plate,
          the pitch on the left and the programme kinds under it. */}
      <section className={`${styles.shell} ${styles.partner}`} id="partners" aria-labelledby="partner-title">
        <div className={styles.partnerPlate}>
          <div>
            <p className={styles.kicker}>Partner with Nature Class</p>
            <h2 id="partner-title" className={styles.sectionTitle}>{t("Already teach outside? Bring your programme in.")}</h2>
            <p className={styles.partnerLead}>{t("If you already run sessions outdoors, Nature Class can carry them to class teachers everywhere, grounded to each school’s own grounds and day.")}</p>
            <ul className={`${styles.chipRow} ${styles.partnerKinds}`} aria-label={t("Programmes")}>
              {partnerKinds.map((kind) => (
                <li key={kind} className={`${styles.chip} ${styles.partnerChip}`}>
                  {t(kind)}
                </li>
              ))}
            </ul>
          </div>
          <a
            className={`${styles.paperAction} ${styles.partnerAction}`}
            href="mailto:hi@natureclass.education?subject=What%20I%20teach"
          >
            Tell us what you teach <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>
      <section className={styles.shaped} aria-labelledby="shaped-title">
        <div className={styles.shell}>
          <p className={styles.kicker}>How it was made</p>
          <h2 id="shaped-title" className={styles.shapedTitle}>
            Shaped with teachers, outdoor educators and subject experts.
          </h2>
          <dl className={styles.makerCredits}>
            {makers.map(({ role, name, href, line }) => (
              <div key={name}>
                <dt>{role}</dt>
                <dd>
                  <a href={href} rel="noreferrer" target="_blank">
                    {name}
                  </a>
                  <p>{line}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
