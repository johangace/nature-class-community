import { Suspense } from "react";
import { FieldPrint } from "./FieldPrint";
import { isPreparedOfflineUiEnabled } from "@/lib/offline/prepared-feature";

export const dynamic = "force-static";

export default function FieldPrintPage() {
  return (
    <Suspense fallback={<main className="print-page">Opening the saved print copy…</main>}>
      <FieldPrint preparedEnabled={isPreparedOfflineUiEnabled()} />
    </Suspense>
  );
}
