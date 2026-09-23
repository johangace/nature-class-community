-- LearnerContext on the class row (#205, office#330 wave 1).
--
-- Three nullable columns, additive, no backfill and no default. Every existing
-- class row keeps working untouched: a null column is a DECLARED-EMPTY slot,
-- which every surface already knows how to render as silence, and the ability
-- band derives from the class's existing yearGroup when it is null — which
-- reproduces today's behaviour exactly (lib/learner-context.ts).
--
-- jurisdiction is deliberately NOT backfilled. It cannot be derived from
-- locale, from climate, or from the year-group vocabulary: the year-group
-- dropdown offers England's words only, so a backfill from it would stamp
-- every school on earth "england" — Phoenix included, which is the precise
-- test case this dimension exists for. Null until a teacher supplies it.
--
-- No child data has a field here. These are facts about a class's teaching
-- context, not about anyone in it.
ALTER TABLE "class" ADD COLUMN "jurisdiction" TEXT;
ALTER TABLE "class" ADD COLUMN "abilityBand" TEXT;
ALTER TABLE "class" ADD COLUMN "sessionShape" TEXT;
