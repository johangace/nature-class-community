import Image from "next/image";
import Link from "next/link";
import { INTL_LOCALE, type Locale } from "@/lib/localization";
import { localeHref } from "@/lib/locale-links";
import { Wordmark } from "../Wordmark";
import { landingText } from "../welcome/landing-copy";
import { landingLesson } from "../welcome/landing-lesson";
import { AudienceLinks } from "./AudienceLinks";
import styles from "./audiences.module.css";
import landing from "../welcome/Landing.module.css";
import { SchoolLeadership } from "./SchoolLeadership";
import { PublicHeader } from "./PublicHeader";
import { ParentsContent } from "./ParentsContent";
import { PreparationGlyph } from "../session/PreparationGlyph";

export type Audience = "schools" | "parents";
export function AudiencePage({ audience, locale, automatic = false }: { audience: Audience; locale: Locale; automatic?: boolean }) {
  const school = audience === "schools";
  const us = locale === "us";
  const t = (value: string) => landingText(value, locale);
  const href = (value: string) => localeHref(value, locale, automatic);
  const lessonHref = href(`/run?session=${landingLesson.id}&at=settle`);
  const contactHref = "mailto:hi@natureclass.education?subject=Nature%20Class%20for%20our%20school";
  return <div className={school ? `${styles.page} ${styles.schoolPage}` : styles.page} lang={INTL_LOCALE[locale]}>
    <a className={styles.skip} href="#content">Skip to content</a>
    <PublicHeader locale={locale} automatic={automatic} page={audience} />
    <main id="content">
      {!school ? <ParentsContent locale={locale} automatic={automatic} /> : <>
      <section className={styles.schoolHero}>
        <div className={styles.schoolHeroCopy}>
          <p className={styles.kicker}>{t("For headteachers and school leaders")}</p>
          <h1>Outdoor learning for your <span>whole school.</span></h1>
          <p className={styles.lead}>Prepared lessons every teacher can lead on your own grounds, with guidance for staff new to teaching outside.</p>
          <div className={styles.heroActions}>
            <Link className={styles.action} href={lessonHref}>View a lesson <span aria-hidden="true">→</span></Link>
            <a className={styles.quietLink} href={contactHref}>Talk to us about your school</a>
          </div>
          <p className={styles.caption}>Free for teachers. No child accounts.</p>
        </div>
        <figure className={styles.schoolHeroPhoto}><Image src="/landing/birds-nest-circle.jpg" alt="A woven branch circle with painted log seats in a school garden" fill priority sizes="(max-width: 760px) 90vw, 46vw" /></figure>
      </section>
      <section className={styles.section} aria-labelledby="school-offer">
        <h2 id="school-offer">What your school gets</h2>
        <ul className={styles.featureList}>
          <li><PreparationGlyph name="preview" size={28} /><h3>Prepared lessons</h3><p>Objectives, background notes, materials and a lesson preview.</p></li>
          <li><PreparationGlyph name="present" size={28} /><h3>Help while teaching</h3><p>Pictures, spoken prompts and printable resources.</p></li>
          <li><PreparationGlyph name="safety" size={28} /><h3>Safety guidance</h3><p>Practical points to review for your site, conditions and children.</p></li>
          <li><PreparationGlyph name="standards" size={28} /><h3>Records and curriculum links</h3><p>Minutes outside by class and term, plus curriculum links.</p></li>
        </ul>
      </section>
      <section className={`${styles.section} ${styles.questionBand}`} aria-labelledby="school-questions">
        <h2 id="school-questions">{us ? "Questions principals ask" : "Questions heads ask"}</h2>
        <SchoolLeadership locale={locale} />
      </section>
      {/* Each edition names its own frameworks and funding: England has the DfE
          Climate Action Plan and the Nature Park grant; the US has no national
          equivalent, so it points to Eco-Schools USA, Green Ribbon Schools and
          state schoolyard grants, with no dollar figure. */}
      <section className={`${styles.section} ${styles.climatePlan}`} aria-labelledby="school-climate">
        <figure className={styles.climatePhoto}><Image src="/landing/seed-feeder-branch.jpg" alt="A seed feeder hanging from a branch" fill sizes="(max-width: 760px) 90vw, 36vw" /></figure>
        {us ? <div>
          <p className={styles.kicker}>Sustainability plan</p>
          <h2 id="school-climate">Put your schoolyard at the heart of your sustainability plan.</h2>
          <p>Nature Class combines habitat improvements, student observations and ready-to-lead outdoor learning into one practical school program. It can support the environmental education recognized by Eco-Schools USA and the U.S. Department of Education Green Ribbon Schools award.</p>
          <a className={styles.quietLink} href="https://www.nwf.org/Eco-Schools-US">Eco-Schools USA from the National Wildlife Federation</a>
        </div> : <div>
          <p className={styles.kicker}>Climate Action Plan</p>
          <h2 id="school-climate">Put your school grounds at the heart of your Climate Action Plan.</h2>
          <p>Nature Class combines biodiversity improvements, pupil monitoring and ready-to-lead outdoor learning into one practical school programme. We can also help eligible schools make use of National Education Nature Park funding.</p>
          <a className={styles.quietLink} href="https://www.gov.uk/environment/climate-change-adaptation">Climate change adaptation on GOV.UK</a>
        </div>}
      </section>
      <section className={`${styles.section} ${styles.fundingBand}`} aria-labelledby="school-funding">
        {us ? <>
          <div>
            <p className={styles.kicker}>Funding</p>
            <h2 id="school-funding">Grants for your schoolyard.</h2>
            <p>Many states and local partners fund schoolyard habitats and outdoor classrooms, such as the Illinois Schoolyard Habitat Action Grant and California’s CAL FIRE Green Schoolyards grants. We help you find a fit and shape the project, alongside free Nature Class lessons.</p>
          </div>
          <a className={styles.action} href="mailto:hi@natureclass.education?subject=Schoolyard%20grants">Ask about schoolyard grants <span aria-hidden="true">→</span></a>
        </> : <>
          <div>
            <p className={styles.kicker}>Funding</p>
            <h2 id="school-funding">Up to £5,000 for your grounds.</h2>
            <p>Schools in England selected by the Department for Education can apply through the National Education Nature Park for grounds improvements. We help plan and deliver the project, alongside free Nature Class lessons.</p>
          </div>
          <Link className={styles.action} href={href("/schools/nature-park")}>See the Nature Park package <span aria-hidden="true">→</span></Link>
        </>}
      </section>
      <section className={styles.section}>
        <h2>Why teach outside?</h2>
        <div className={styles.benefitRows}>
          <div><h3>Classroom engagement</h3><p>A study of two classes found better engagement after lessons in nature. <a href="https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.02253/full">Read the study</a></p></div>
          <div><h3>Different ways to participate</h3><p>Children can observe, move, make and discuss what they find.</p></div>
          <div><h3>Learning from real things</h3><p>Study plants and habitats on your grounds, then return to see what changes.</p></div>
        </div>
      </section>
      <section className={`${styles.section} ${styles.photoSection}`}>
        <figure className={`${styles.editorialPhoto} ${landing.cutTwo}`}><Image src="/landing/tyre-swing-den.jpg" alt="A tyre swing and branch den in a school garden" fill sizes="(max-width: 760px) 90vw, 40vw" /></figure>
        <div><h2>Use the grounds you have</h2><p>Start with a tree, planter or patch of vegetation. Choose lessons that suit your space. Use children’s observations to decide what to care for or improve.</p>
          <details><summary>Safety and supervision</summary><p>Teachers review the activity guidance alongside the school’s own site assessment, supervision arrangements and children’s needs.</p></details>
          <details><summary>{us ? "For schools in the United States" : "For schools in England"}</summary>
            {us ? <p>Check lesson objectives and NGSS links against your state’s standards and district curriculum.</p> : <><p>Grounds projects can support biodiversity and education in your climate action plan. <a href="https://www.gov.uk/guidance/sustainability-leadership-and-climate-action-plans-in-education">DfE guidance</a></p><p>For Ofsted, explain what children learn and how they participate. Nature Class does not provide an inspection rating or endorsement. <a href="https://www.gov.uk/government/publications/education-inspection-framework-eif/education-inspection-framework-for-use-from-november-2025">Ofsted framework</a></p></>}
          </details>
        </div>
      </section>
      <section className={styles.close}>
        <div><h2>Cost and getting started</h2><p>Nature Class is free for teachers. Check each lesson’s materials before you start.</p><p>{t("For support across your school, tell us about your teachers, timetable and grounds.")}</p></div>
        <a className={styles.closeAction} href={contactHref}>Contact us <span aria-hidden="true">→</span></a>
      </section>
      </>}
    </main>
    <footer className={styles.footer}>
      <Wordmark />
      <nav aria-label="Footer"><AudienceLinks locale={locale} automatic={automatic} /><Link href="/resources">Teaching resources</Link><Link href={href("/sign-in")}>Sign in</Link><Link href={href("/privacy")}>Privacy</Link><Link href={href("/terms")}>Terms</Link></nav>
    </footer>
  </div>;
}
