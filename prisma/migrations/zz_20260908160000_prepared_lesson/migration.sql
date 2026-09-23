CREATE TABLE "prepared_lesson" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "sourceRevision" TEXT NOT NULL,
  "contextRevision" TEXT NOT NULL,
  "sourceSnapshot" JSONB NOT NULL,
  "contextSnapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "proposalRevision" TEXT,
  "proposalSnapshot" JSONB,
  "composedSession" JSONB,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prepared_lesson_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prepared_lesson_status" CHECK ("status" IN ('pending', 'composing', 'proposed', 'failed')),
  CONSTRAINT "prepared_lesson_proposal" CHECK (
    ("status" = 'proposed' AND "proposalRevision" IS NOT NULL AND "proposalSnapshot" IS NOT NULL AND "composedSession" IS NOT NULL)
    OR ("status" <> 'proposed' AND "proposalRevision" IS NULL AND "proposalSnapshot" IS NULL AND "composedSession" IS NULL)
  )
);
CREATE UNIQUE INDEX "prepared_lesson_teacherId_requestKey_key" ON "prepared_lesson"("teacherId", "requestKey");
CREATE INDEX "prepared_lesson_teacherId_sessionId_idx" ON "prepared_lesson"("teacherId", "sessionId");
ALTER TABLE "prepared_lesson" ADD CONSTRAINT "prepared_lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
