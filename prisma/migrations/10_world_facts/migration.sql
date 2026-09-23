-- The teacher's assistant chat: an extraction provenance ledger (#280).
--
-- Additive only: a brand new table, nothing on any existing table changes
-- shape. A confirmed row here is mirrored onto the pre-existing
-- Class.siteFeatures / Class.siteNotes / Class.reach columns through the
-- same write path `setWorld` already uses, so every existing reader keeps
-- working unchanged. This table exists so a teacher-stated fact that arrived
-- through the chat can always be traced back to what she actually typed and
-- how sure the model was, same discipline the cast's recorded/regional tiers
-- already run on. No child data of any kind: `sourceText` is a fragment of
-- her own words about the PLACE, hung off the class row, never a lesson or a
-- completion.
CREATE TABLE "world_fact" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'teacher-stated',
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "classId" TEXT NOT NULL,

    CONSTRAINT "world_fact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "world_fact_classId_status_idx" ON "world_fact"("classId", "status");

ALTER TABLE "world_fact" ADD CONSTRAINT "world_fact_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
