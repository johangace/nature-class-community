import { INTL_LOCALE, localizeDeep, type Locale } from "@/lib/localization";
import { localeHref } from "@/lib/locale-links";
import { landingText } from "./landing-copy";
import Image from "next/image";
import Link from "next/link";
import type { Teacher } from "@/lib/teacher";
import { Wordmark } from "../Wordmark";
import { PublicHeader } from "../audiences/PublicHeader";
import { AudienceLinks } from "../audiences/AudienceLinks";
import { LandingBody } from "./LandingBody";
import { landingLesson as sourceLesson } from "./landing-lesson";
import styles from "./Landing.module.css";
import todayStyles from "../today.module.css";
import { PreparationGlyph } from "../session/PreparationGlyph";

interface LandingProps {
  teacher?: Teacher | null;
  locale?: Locale;
  automatic?: boolean;
}

export function Landing({ teacher = null, locale = "uk", automatic = false }: LandingProps = {}) {
  const t = (text: string) => landingText(text, locale);
  const landingLesson = localizeDeep(sourceLesson, locale);
  const tryHref = localeHref(teacher ? "/today" : "/start", locale, automatic);

  return (
    <main className={styles.page} lang={INTL_LOCALE[locale]}>
      <PublicHeader locale={locale} automatic={automatic} teacher={teacher} />

      <section className={`${styles.shell} ${styles.hero}`} aria-labelledby="landing-title">
        <div className={styles.heroIntro}>
          <div>
            <p className={styles.kicker}>For anyone leading outdoor learning</p>
            <h1 id="landing-title" className={styles.heroTitle}>
              <span>Teach with</span>{" "}<span>Nature.</span>
            </h1>
            <p className={styles.heroSubheader}>Ready-to-lead outdoor lessons for any educator, right outside your classroom.</p>
          </div>
          <div className={styles.heroCopy}>
            <div className={styles.heroActions}>
              <Link className={styles.primaryAction} href={tryHref}>
                {teacher ? "Continue with your class" : "Try today’s lesson"}{" "}
                <span aria-hidden="true">→</span>
              </Link>
              <Link className={styles.quietAction} href={localeHref("/season", locale, automatic)}>
                Browse the curriculum
              </Link>
            </div>
            <p className={styles.reassurance}>
              Free for teachers. Open source. No child accounts or profiles.{" "}
              <span className={styles.reassuranceDevice}>
                Works on any device, and especially well on an iPad.
              </span>
            </p>
          </div>
        </div>

        <figure className={styles.heroVisual}>
          <div className={`${styles.photo} ${styles.cutOne} ${styles.heroPhotoMain}`}>
            <Image
              alt="Children holding red cherries in their open hands outdoors"
              fill
              priority
              sizes="(max-width: 760px) 100vw, 52vw"
              src="/landing/cherries-in-hand.jpg"
            />
          </div>
          <div className={`${styles.photo} ${styles.cutLeaf} ${styles.heroPhotoSmall}`}>
            <Image
              alt="A circular bird’s nest space woven from branches with painted log seats"
              fill
              sizes="(max-width: 760px) 50vw, 24vw"
              src="/landing/birds-nest-circle.jpg"
            />
          </div>
          <div className={`${styles.photo} ${styles.cutLeafMirror} ${styles.heroPhotoSmall}`}>
            <Image
              alt="Botanical prints on fabric beside painted wood slices on an outdoor table"
              fill
              sizes="(max-width: 760px) 50vw, 24vw"
              src="/landing/botanical-print-table.jpg"
            />
          </div>

          <figcaption className={styles.photoCaption}>Nature Class in practice</figcaption>
        </figure>

        <section className={styles.heroLesson} id="explore-lesson" aria-labelledby="hero-lesson-title">
          <div className={styles.heroLessonContext}>
            <p>An example day in London</p>
            <span className={styles.placeChip}><PreparationGlyph name="place" size={18} />London</span>
            <span className={styles.seasonChip}><PreparationGlyph name="season" size={18} />{t("Autumn")}</span>
            <span className={styles.weatherChip}><PreparationGlyph name="rain" size={18} />Rain</span>
          </div>
          <h2 className={todayStyles.title} id="hero-lesson-title">{landingLesson.title}</h2>
          <p className={todayStyles.question}>{landingLesson.question}</p>
          <blockquote className={styles.heroLessonExcerpt}><span aria-hidden="true">“</span>{landingLesson.excerpt}<span aria-hidden="true">”</span></blockquote>
          <div className={styles.heroLessonFooter}>
            <p className={todayStyles.meta}>Outside · {landingLesson.durationMin} minutes · {landingLesson.namedSkill}</p>
            <Link className={todayStyles.start} href={localeHref(`/run?session=${landingLesson.id}&at=settle`, locale, automatic)}>
              Start lesson <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
        <div className={styles.introduction} aria-labelledby="introduction-title">
          <div className={styles.introductionHeading}>
            <span className={styles.introductionMark}><svg aria-hidden="true" width="56" height="56" viewBox="-32 -26 52 46">
                <g strokeWidth="2.2">
                  <circle cx="-22" cy="13" fill="currentColor" opacity="0.35" r="1.5" />
                  <circle cx="-14" cy="6" fill="currentColor" opacity="0.55" r="1.8" />
                  <g transform="rotate(30)">
                    <ellipse cx="0" cy="12" fill="currentColor" rx="2.6" ry="5.4" />
                    <path d="M0,6 L0,-9 M0,-9 L-9,-19 M0,-9 L-4.5,-22 M0,-9 L0.5,-23.5 M0,-9 L5.5,-21.5 M0,-9 L9.5,-18" fill="none" stroke="currentColor" strokeLinecap="round" />
                  </g>
                </g>
              </svg></span>
            <h2 id="introduction-title">What is<br />Nature Class?</h2>
          </div>
          <div className={styles.introductionCopy}>
            <h3 className={styles.introductionSubheader}>Bring learning outside.</h3>
            <p><strong>Nature Class empowers any adult to facilitate outdoor learning.</strong>{" "}
              Ready-to-lead lessons, words to guide you and activities to explore together.</p>
          </div>
        </div>
      </section>

      <LandingBody signedIn={Boolean(teacher)} locale={locale} automatic={automatic} />

      <footer className={styles.footer}>
        <div className={`${styles.shell} ${styles.footerInner}`}>
          <Wordmark />
          <p>
            Teach with Nature.{" "}
            <AudienceLinks locale={locale} automatic={automatic} />{" · "}
            <Link className={styles.footerLink} href="/resources">Teaching resources</Link>{" · "}
            <Link className={styles.footerLink} href={localeHref("/privacy", locale, automatic)}>Privacy</Link>{" · "}
            <Link className={styles.footerLink} href={localeHref("/terms", locale, automatic)}>Terms</Link>
          </p>
        </div>
      </footer>
    </main>
  );
}
