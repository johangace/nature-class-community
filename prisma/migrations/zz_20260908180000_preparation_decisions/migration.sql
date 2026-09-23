ALTER TABLE "prepared_lesson"
  ADD COLUMN "usageClass" TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN "evaluationDataset" TEXT,
  ADD COLUMN "evaluationSplit" TEXT,
  ADD CONSTRAINT "prepared_lesson_usage_check" CHECK (
    ("usageClass" IN ('production', 'test') AND "evaluationDataset" IS NULL AND "evaluationSplit" IS NULL)
    OR ("usageClass" = 'evaluation' AND "evaluationDataset" IS NOT NULL AND length("evaluationDataset") > 0 AND "evaluationSplit" IS NOT NULL AND "evaluationSplit" IN ('training', 'held-out'))
  );
CREATE TABLE "preparation_decision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "preparedId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "decidedRevision" TEXT NOT NULL,
  "note" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "preparation_decision_preparedId_fkey" FOREIGN KEY ("preparedId") REFERENCES "prepared_lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "preparation_decision_kind_reason_check" CHECK (
    ("decision" = 'accepted' AND "reasonCode" = 'accepted-unchanged') OR
    ("decision" = 'edited' AND "reasonCode" = 'edited-for-this-class') OR
    ("decision" = 'dismissed' AND "reasonCode" IN ('dismissed-materials-missing', 'dismissed-not-right-today', 'dismissed-prefer-authored', 'rejected-unsupported-claim', 'rejected-safety-line-changed')) OR
    ("decision" = 'withdrawn' AND "reasonCode" = 'withdrawn-corrected-after-teaching')
  )
);
CREATE UNIQUE INDEX "preparation_decision_preparedId_requestKey_key" ON "preparation_decision"("preparedId", "requestKey");
CREATE INDEX "preparation_decision_preparedId_createdAt_idx" ON "preparation_decision"("preparedId", "createdAt");
