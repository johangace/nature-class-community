-- The school's own world (#277, office#330 dimension 7).
--
-- Additive, nullable or empty-by-default, no backfill. Every existing class
-- row keeps working: an empty feature list and a null place read both mean
-- "nobody has told us", which every surface renders as silence.
--
-- Two halves kept apart, because they are known in different ways and must
-- never render as each other:
--   siteFeatures / siteNotes / reach  what the TEACHER said. She is standing
--                                     in it, so she wins over anything derived.
--   placeRead / placeReadAt           what the MAP said, with the stamp of
--                                     when. Refreshed on its own TTL rather
--                                     than frozen at onboarding.
--
-- siteNotes holds her own words for things our vocabulary has no box for. It
-- is a place fact, never a lesson or a person, which is why it lives here on
-- the class row and nowhere near a session completion. The zero-child-PII
-- boundary is unchanged: no child record exists anywhere in this schema.
ALTER TABLE "class" ADD COLUMN "siteFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "class" ADD COLUMN "siteNotes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "class" ADD COLUMN "reach" TEXT;
ALTER TABLE "class" ADD COLUMN "placeRead" JSONB;
ALTER TABLE "class" ADD COLUMN "placeReadAt" TIMESTAMP(3);
