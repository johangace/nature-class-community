-- Cross-instance AI rate limiter (office#332). The module-level `Map` in
-- app/api/lesson-support/route.ts only ever counted attempts seen by the one
-- serverless instance holding it, so the 12-per-60-seconds ceiling was really
-- 12 x however many instances were warm. One row per teacher, holding the
-- sliding-window attempt timestamps that lib/ai/rate-limit.ts reads and
-- prunes on every call.
--
-- ADDITIVE ONLY: one new table, nothing existing touched.
CREATE TABLE "ai_rate_limit" (
    "teacherId" TEXT NOT NULL,
    "attempts" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_rate_limit_pkey" PRIMARY KEY ("teacherId")
);

ALTER TABLE "ai_rate_limit" ADD CONSTRAINT "ai_rate_limit_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
