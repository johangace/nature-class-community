import { landingText } from "../welcome/landing-copy";
import type { Locale } from "@/lib/localization";
import styles from "./audiences.module.css";

// Moved from the original homepage (4b0376e), with preparation/duration claims corrected.
const schoolPains = [
  [
    "Can teachers lead without nature training?",
    "Teachers can prepare with the lesson preview and background notes, then use the pictures and prompts outside.",
  ],
  [
    "How much preparation is needed?",
    "The resources are prepared. Teachers check the lesson, materials and safety guidance for their class and site.",
  ],
  [
    "Will it fit our timetable?",
    "Choose by lesson duration and use your own grounds. A regular slot helps teachers plan ahead.",
  ],
  [
    "What can we share with governors and parents?",
    "Minutes outside by class and term, and the curriculum links printed on each lesson.",
  ],
] as const;

/** The questions a school leader asks first, answered in the open rather than folded away. */
export function SchoolLeadership({ locale }: { locale: Locale }) {
  const t = (text: string) => landingText(text, locale);
  return <dl className={styles.questions}>
    {schoolPains.map(([question, answer]) => <div key={question}><dt>{t(question)}</dt><dd>{t(answer)}</dd></div>)}
  </dl>;
}
