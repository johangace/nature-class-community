import type { OfflineReadiness } from "@/lib/offline/readiness";
import styles from "./field.module.css";

export function DepartureCheck({
  readiness,
  onPrepare,
  preparedEnabled = false,
  printHref,
}: {
  readiness: OfflineReadiness;
  onPrepare?: () => void;
  preparedEnabled?: boolean;
  printHref?: string;
}) {
  return (
    <section className={styles.departure} aria-labelledby="departure-check-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>Before you leave</p>
        <h2 id="departure-check-title">Departure check</h2>
      </div>

      <div className={styles.readinessRows} aria-live="polite">
        <div className={styles.readinessRow} data-state={readiness.basic.status}>
          <span className={styles.statusMark} aria-hidden="true">
            {readiness.basic.status === "ready"
              ? "✓"
              : readiness.basic.status === "checking"
                ? "…"
                : "○"}
          </span>
          <div>
            <h3>{readiness.basic.label}</h3>
            <p>{readiness.basic.detail}</p>
          </div>
        </div>

        {preparedEnabled && (
          <div className={styles.readinessRow} data-state={readiness.field.status}>
            <span className={styles.statusMark} aria-hidden="true">
              {readiness.field.status === "ready" ? "✓" : "○"}
            </span>
            <div>
              <h3>{readiness.field.label}</h3>
              <p>{readiness.field.detail}</p>
              {readiness.field.actionLabel && (
                <>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    disabled={!onPrepare}
                    onClick={onPrepare}
                  >
                    {readiness.field.actionLabel}
                  </button>
                  {!onPrepare && (
                    <p className={styles.actionNote}>
                      Preparation is not connected on this device yet.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {printHref && (
          <div className={styles.readinessRow} data-state="ready">
            <span className={styles.statusMark} aria-hidden="true">✓</span>
            <div>
              <h3>Print copy available</h3>
              <p>A paper copy is the fallback that does not depend on this device.</p>
              <a className={styles.textLink} href={printHref}>Open print copy</a>
            </div>
          </div>
        )}
      </div>

      <div className={styles.conditions}>
        <h3>When you step outside</h3>
        <p className={styles.observation}>{readiness.conditions.observation}</p>
        {readiness.conditions.receipt && (
          <p className={styles.receipt}>
            {readiness.conditions.receipt.summary
              ? `${readiness.conditions.receipt.summary} · `
              : ""}
            {readiness.conditions.receipt.label}
            {readiness.conditions.receipt.stale ? " · Older reading" : ""}. Receipt only; what
            the class sees now leads.
          </p>
        )}
      </div>

      <div className={styles.wifiBoundary}>
        <h3>What still needs Wi-Fi</h3>
        <ul>
          {preparedEnabled && (
            <li>
              Preparing or refreshing the field version: selected lesson text, selected safety,
              spoken recordings when available, and a timestamped conditions receipt.
            </li>
          )}
          <li>Saving a lesson to your class journal or opening personalised class tools.</li>
          <li>Opening any lesson or recording that has not already been saved on this device.</li>
        </ul>
        <p>
          {preparedEnabled
            ? "This prepared field version does not save pictures or local species cards. "
            : "The basic offline version does not save selected lesson adaptations, selected safety, spoken recordings, conditions receipts, pictures or local species cards. "}
          The basic lesson, general safety, field steps and print copy remain available without
          Wi-Fi once the departure check says they are saved.
        </p>
      </div>
    </section>
  );
}
