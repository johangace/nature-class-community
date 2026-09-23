-- One-tap reflection on a logged session. Nullable and additive: existing
-- rows and existing clients are untouched. No free-text column by design
-- (zero child PII has no field to leak into).
ALTER TABLE "session_completion" ADD COLUMN "mood" TEXT;
