import { Suspense } from "react";
import { FieldShell } from "./FieldShell";
import { isPreparedOfflineUiEnabled } from "@/lib/offline/prepared-feature";
import styles from "./field.module.css";

export const dynamic = "force-static";

export default function FieldPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <div className={styles.shell}>
            <div className={styles.notice} role="status" aria-busy="true">
              Opening the lessons saved with Nature Class…
            </div>
          </div>
        </main>
      }
    >
      <FieldShell preparedEnabled={isPreparedOfflineUiEnabled()} />
    </Suspense>
  );
}
