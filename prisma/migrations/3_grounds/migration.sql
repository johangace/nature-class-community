-- The class's grounds: the habitats a teacher says are actually out there,
-- picked on onboarding screen 5 (trees, meadow, hedgerow, pond, playground,
-- coast). Additive and optional — a text array defaulting to empty, so every
-- existing class row and the whole onboarding flow work with it left unset.
-- Teacher-entered place facts only; no child data has a field here.
ALTER TABLE "class" ADD COLUMN "grounds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
