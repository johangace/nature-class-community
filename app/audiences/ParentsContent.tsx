import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/lib/localization";
import { localeHref } from "@/lib/locale-links";
import { PreparationGlyph } from "../session/PreparationGlyph";
import styles from "./parents.module.css";

/** A short family invitation using the existing lesson collection and supplied photos. */
export function ParentsContent({ locale, automatic }: { locale: Locale; automatic: boolean }) {
  const lessons = localeHref("/season", locale, automatic);
  return <>
    <section className={styles.hero}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Nature Class for parents</p>
        <h1>Discover nature<br /><span>together.</span></h1>
        <p className={styles.lead}>Make time outside something you both look forward to. Explore, ask questions and learn about the world around you, side by side.</p>
        <Link className={styles.button} href={lessons}>Find a lesson <span aria-hidden="true">↗</span></Link>
      </div>
      <div className={styles.photos}>
        <figure className={styles.mainPhoto}><Image src="/landing/family-garden-london.webp" alt="Adults and children exploring plants together in a raised garden bed" fill priority sizes="(max-width: 600px) 90vw, 50vw" /></figure>
      </div>
    </section>
    <section className={styles.offer} aria-labelledby="parents-offer">
      <div className={styles.offerHeading}><h2 id="parents-offer">Busy, no garden, not a nature expert? You can still start.</h2><p>Time, knowledge and access can get in the way. Here’s how Nature Class helps.</p></div>
      <div className={styles.resources}>
        <div className={styles.resource}>
          <span className={styles.glyph}><PreparationGlyph name="preview" size={28} /><span>Time</span></span>
          <h3>Less to plan.</h3>
          <p className={styles.hurdle}>Finding something to do shouldn’t become another job.</p>
          <p>Lesson plans, timings and materials lists help you choose what fits your day and prepare before you go.</p>
        </div>
        <div className={styles.resource}>
          <span className={styles.glyph}><PreparationGlyph name="primer" size={28} /><span>Knowledge</span></span>
          <h3>You don’t need all the answers.</h3>
          <p className={styles.hurdle}>You can learn about nature while your child does.</p>
          <p>Background notes, pictures and questions give you something to explore and talk about together.</p>
        </div>
        <div className={styles.resource}>
          <span className={styles.glyph}><PreparationGlyph name="life" size={28} /><span>Access</span></span>
          <h3>Start with nature nearby.</h3>
          <p className={styles.hurdle}>Living in a city doesn’t mean missing out.</p>
          <p>A park, street trees or a shared courtyard can be a starting point. Choose a lesson that suits the space and nature you have.</p>
        </div>
      </div>
      <p className={styles.note}>Includes lesson plans, background notes, pictures, spoken prompts and printable resources.</p>
    </section>
    <section className={styles.homeEd} id="home-education">
      <figure><Image src="/landing/botanical-print-table.jpg" alt="Botanical prints and painted wood slices on an outdoor table" fill sizes="(max-width: 600px) 90vw, 40vw" /></figure>
      <div><h2>{locale === "us" ? "Nature lessons for homeschooling" : "Nature lessons for home education"}</h2><p>{locale === "us" ? "Use lesson objectives and NGSS links to plan learning at home." : "Use lesson objectives and National Curriculum links to plan learning at home."} Background notes and printable resources help you prepare. Choose what fits your child and explore together.</p><Link className={styles.textLink} href={lessons}>Explore the lesson collection <span aria-hidden="true">↗</span></Link></div>
    </section>
    <section className={styles.closeBand} aria-labelledby="parents-close">
      <h2 id="parents-close">Find a lesson for this week.</h2>
      <Link className={styles.closeButton} href={lessons}>See the season’s lessons <span aria-hidden="true">→</span></Link>
    </section>
  </>;
}
