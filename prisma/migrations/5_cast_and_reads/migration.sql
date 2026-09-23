-- Workstream A of the living-cast epic (#172): the replay corpus, the resolved
-- cast, and the climate tag that picks a school's seasonal expectations.
--
-- ADDITIVE ONLY. One nullable column on an existing table and two new tables.
-- Nothing is dropped, renamed, retyped, or backfilled, so every row that exists
-- today is untouched and every query that runs today still runs. Deploying this
-- ahead of the code that reads it is safe, and so is the reverse.
--
-- REVERSING IT: drop the two tables and the one column (see the down notes at
-- the foot of this file). Nothing else has to be undone, because nothing else
-- was changed.

-- The class's climate group, derived from its coordinates. Nullable with no
-- default: a class that predates this, or one with no coordinates, simply has
-- no tag, and every reader falls back to deriving it from lat/lng.
ALTER TABLE "class" ADD COLUMN "climate" TEXT;

-- The replay corpus: one row per class per nightly read, payload stored
-- verbatim. A failed read is a row with a NULL payload and a reason — silence
-- is data, and a corpus that only kept successes could never show a location
-- going quiet.
CREATE TABLE "pointmoon_read" (
    "id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "payload" JSONB,
    "schemaVersion" TEXT,
    "failureReason" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classId" TEXT NOT NULL,

    CONSTRAINT "pointmoon_read_pkey" PRIMARY KEY ("id")
);

-- The corpus is read two ways: one class's history in order (the replay), and
-- everything taken on a given night (the sweep).
CREATE INDEX "pointmoon_read_classId_takenAt_idx" ON "pointmoon_read"("classId", "takenAt");
CREATE INDEX "pointmoon_read_takenAt_idx" ON "pointmoon_read"("takenAt");

-- A class's resolved cast. Stored rather than recomputed per request so the
-- class's shared vocabulary holds still between deliberate refreshes.
CREATE TABLE "cast_member" (
    "id" TEXT NOT NULL,
    "commonName" TEXT NOT NULL,
    "scientificName" TEXT,
    "photoUrl" TEXT,
    "iconicTaxon" TEXT,
    "honestyTier" TEXT NOT NULL,
    "lastSeenWindow" INTEGER,
    "yearsObserved" INTEGER,
    "historicalAvgCount" INTEGER,
    "safetyNote" TEXT,
    "sortRank" INTEGER NOT NULL,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classId" TEXT NOT NULL,

    CONSTRAINT "cast_member_pkey" PRIMARY KEY ("id")
);

-- The surfaces ask for one class's present cast in order, and separately for
-- its absences; this index serves both without a sort.
CREATE INDEX "cast_member_classId_absent_sortRank_idx" ON "cast_member"("classId", "absent", "sortRank");

-- Both children of a class, and both cascade with it: deleting a class takes
-- its own reads and its own cast, exactly as it already takes its completions.
ALTER TABLE "pointmoon_read" ADD CONSTRAINT "pointmoon_read_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cast_member" ADD CONSTRAINT "cast_member_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DOWN (manual, should it ever be needed):
--   DROP TABLE "cast_member";
--   DROP TABLE "pointmoon_read";
--   ALTER TABLE "class" DROP COLUMN "climate";
-- Dropping the tables discards the corpus, which is the one genuinely
-- unrecoverable thing here: the nights it holds cannot be re-fetched. Reverse
-- the code first and leave the tables standing unless the data is truly unwanted.
