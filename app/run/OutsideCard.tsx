import type { ReactElement } from "react";
import styles from "./journey.module.css";

/** The same introduction ends with a transition suited to its starting place. */
export function OutsideCard({ setting = "indoors" }: { setting?: "indoors" | "outside" }): ReactElement {
  return (
    <div className={styles.body}>
      <p className={styles.tEyebrow}>Introduce today</p>
      <h1 className={styles.doorTitle}>
        {setting === "outside" ? "Let’s bring our ideas to life." : "Let’s take our ideas outside."}
      </h1>
    </div>
  );
}
