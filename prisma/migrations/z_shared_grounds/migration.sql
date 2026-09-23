-- Shared Grounds profiles (#827), expand phase.
--
-- This migration's `z_` prefix is intentional. The repository's historical
-- migration folders begin with non-padded numbers, so lexical order runs
-- `10_*` before `3_*`; sorting after that complete chain is required for a
-- clean database, where the Class place columns do not exist until `3_*` and
-- `8_*`.
--
-- Every existing class receives its own Grounds row first. Nothing is merged
-- by school name or coordinates: two teachers' descriptions, or two classes'
-- different reach, remain distinct until a teacher explicitly chooses to
-- share them in the interface. The old Class columns stay in place during the
-- rollout/rollback window and are mirrored by the application.

CREATE TABLE "grounds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "habitats" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "climate" TEXT,
    "siteFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "siteNotes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "reach" TEXT,
    "placeRead" JSONB,
    "placeReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teacherId" TEXT NOT NULL,

    CONSTRAINT "grounds_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "class" ADD COLUMN "groundsId" TEXT;

INSERT INTO "grounds" (
    "id", "name", "school", "lat", "lng", "habitats", "climate",
    "siteFeatures", "siteNotes", "reach", "placeRead", "placeReadAt",
    "createdAt", "updatedAt", "teacherId"
)
SELECT
    'class_' || "id",
    "name" || ' grounds',
    "school",
    "lat",
    "lng",
    "grounds",
    "climate",
    "siteFeatures",
    "siteNotes",
    "reach",
    "placeRead",
    "placeReadAt",
    "createdAt",
    "updatedAt",
    "teacherId"
FROM "class";

UPDATE "class"
SET "groundsId" = 'class_' || "id";

CREATE INDEX "grounds_teacherId_idx" ON "grounds"("teacherId");
CREATE INDEX "class_groundsId_idx" ON "class"("groundsId");

ALTER TABLE "grounds" ADD CONSTRAINT "grounds_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class" ADD CONSTRAINT "class_groundsId_fkey"
FOREIGN KEY ("groundsId") REFERENCES "grounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
