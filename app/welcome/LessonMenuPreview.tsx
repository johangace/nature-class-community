import type { Locale } from "@/lib/localization";
import { localeHref } from "@/lib/locale-links";
import Link from "next/link";
import { PreparationGlyph } from "../session/PreparationGlyph";
import menu from "../session/session-modes.module.css";
import styles from "./Landing.module.css";
import { landingLesson } from "./landing-lesson";

const rows = [
  { icon: "preview", label: "Preview lesson", detail: "Spoken walkthrough", tone: menu.glyphSpoken },
  { icon: "primer", label: "Pre-reading", detail: "What to bring and where to go", tone: "" },
  { icon: "conditions", label: "Conditions", detail: "", tone: menu.glyphConditions },
  { icon: "safety", label: "Safety", detail: "", tone: "" },
  { icon: "print", label: "Print", detail: "", tone: "" },
] as const;

/** A sharp, compact view of the production preparation menu. */
export function LessonMenuPreview({ locale = "uk", automatic = false }: { locale?: Locale; automatic?: boolean }) {
  return (
    <div className={styles.lessonMenuPreview}>
      <p className={menu.stateLabel}>Before class</p>
      {rows.map(row => (
        <div className={menu.prepRow} key={row.icon}>
          <span className={`${menu.glyph} ${row.tone}`}><PreparationGlyph name={row.icon} /></span>
          <div className={menu.rowText}>
            <span className={menu.rowAction}>{row.label}</span>
            {row.detail && <p>{row.detail}</p>}
          </div>
          <span className={menu.chevron}><PreparationGlyph name="chevron" size={20} /></span>
        </div>
      ))}
      <p className={`${menu.thresholdLabel} ${styles.menuPreviewThreshold}`}>With your class</p>
      <Link className={menu.start} href={localeHref(`/run?session=${landingLesson.id}&at=settle`, locale, automatic)}>
        <PreparationGlyph name="door" />
        <span>Introduce today’s lesson</span>
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
