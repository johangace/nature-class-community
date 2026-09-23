import Image from "next/image";
import type { Locale } from "@/lib/localization";
import { landingText } from "./landing-copy";
import styles from "./Landing.module.css";

/**
 * What children learn by doing: three activity stories with one teacher voice
 * each, then the long outcome. Moved from the landing to its own Children page
 * (Johan, 2026-09-14); the copy and photos are unchanged.
 */
export const activityStories = [
  {
    subject: "Plant life cycles",
    tags: ["Science", "Biology", "Food"],
    title: "Grow, watch and harvest.",
    body: "Children plant seeds, watch roots and shoots develop, then harvest what has grown.",
    quote:
      "The class were hugely excited about going outside and ‘meeting the trees’, noticing previously unseen elements of their playground environment.",
    cite: "Primary school teacher, Buxton School, London",
    photos: [
      {
        src: "/landing/first-shoots.jpg",
        alt: "Green shoots emerging from soil in low winter sunlight",
        cut: styles.cutTwo,
      },
      {
        src: "/landing/potatoes-in-hand.jpg",
        alt: "Children holding freshly washed potatoes in their hands",
        cut: styles.cutThree,
      },
    ],
  },
  {
    subject: "Sustainability",
    tags: ["Climate action", "Habitats", "Design and technology"],
    title: "Reuse what we have.",
    body: "Children reuse natural and everyday materials to make feeders and shelters for birds and insects.",
    quote:
      "The children now know which birds come to the feeder and talk about them by name. It has given them a real sense of looking after the space.",
    cite: "Primary school teacher, London",
    photos: [
      {
        src: "/landing/bug-hotel-boots.jpg",
        alt: "A small insect hotel made from wood, hollow stems and stacked logs between painted boots",
        cut: styles.cutTwo,
      },
      {
        src: "/landing/seed-feeder-branch.jpg",
        alt: "A seed feeder hanging by string from a bare branch",
        cut: styles.cutThree,
      },
      {
        src: "/landing/boot-birdhouse.jpg",
        alt: "A bird box made from an old boot hanging in a leafy tree",
        cut: styles.cutOne,
      },
    ],
  },
  {
    subject: "Art and making",
    tags: ["Art", "Music", "Materials"],
    title: "Paint, build and make music.",
    body: "Children make things by hand with flowers, soil, sticks and other materials they find outside.",
    quote:
      "The children were proud of their finished work and showed great enthusiasm throughout the activity.",
    cite: "Primary school teacher, Buxton School, London",
    photos: [
      {
        src: "/landing/flower-painting-table.jpg",
        alt: "Flowers, grass, soil, brushes and blank paper arranged on an outdoor table",
        cut: styles.cutFour,
      },
      {
        src: "/landing/garden-wind-chime.jpg",
        alt: "A handmade wind chime with metal pieces hanging on pink string",
        cut: styles.cutOne,
      },
    ],
  },
] as const;

export function ChildrenLearning({ locale = "uk", labelledBy }: { locale?: Locale; labelledBy?: string }) {
  const t = (text: string) => landingText(text, locale);
  return (
    // A page that already names the section in its own h1 passes that id and
    // skips the repeated heading.
    <section className={`${styles.shell} ${styles.work}`} aria-labelledby={labelledBy ?? "activity-stories-title"}>
      {!labelledBy && <div className={styles.sectionHead}>
        <div>
          <p className={styles.kicker}>Children’s work</p>
          <h2 id="activity-stories-title" className={styles.sectionTitle}>
            What children learn by doing.
          </h2>
        </div>
      </div>}
      <ol className={styles.activityStories}>
        {activityStories.map(({ subject, tags, title, body, quote, cite, photos }) => (
          <li className={styles.activityStory} key={subject}>
            <div className={styles.activityStoryCopy}>
              <p className={styles.activitySubject}>{subject}</p>
              <h3>{t(title)}</h3>
              <p>{t(body)}</p>
              <ul className={`${styles.chipRow} ${styles.activityTags}`} aria-label="Subjects">
                {tags.map((tag) => (
                  <li key={tag} className={styles.chip}>
                    {t(tag)}
                  </li>
                ))}
              </ul>
              <figure className={styles.voice}>
                <span className={styles.voiceMark} aria-hidden="true">
                  “
                </span>
                <blockquote>{quote}</blockquote>
                <figcaption>{cite}</figcaption>
              </figure>
            </div>
            <div className={styles.activityMosaic}>
              {photos.map(({ src, alt, cut }) => (
                <div className={`${styles.photo} ${cut} ${styles.activityImage}`} key={src}>
                  <Image
                    alt={t(alt)}
                    fill
                    sizes="(max-width: 760px) 52vw, (max-width: 1020px) 44vw, 30vw"
                    src={src}
                  />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <figure className={styles.childWork}>
        <div className={styles.childWorkImage}>
          <Image
            alt="A child’s handwritten page about clouds, trees and the sea with painted trees, a sun and a rainbow"
            fill
            sizes="(max-width: 760px) 100vw, 40vw"
            src="/landing/child-nature-page.jpg"
          />
        </div>
        <figcaption className={styles.childWorkCopy}>
          <p className={styles.kicker}>The long outcome</p>
          <h3>Every child becomes a guardian of our earth.</h3>
          <p>They know, care for and steward the living world they belong to.</p>
        </figcaption>
      </figure>
    </section>
  );
}
