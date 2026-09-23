-- Idempotency key for logged completions. Additive and reversible:
--   * the column is nullable, so every existing row stays valid untouched;
--   * the unique index permits many NULLs in Postgres, so old keyless rows do
--     not collide with each other;
--   * new rows carry a client-generated key, so a retried offline completion
--     upserts onto the same row instead of double-counting minutes-outside.
--
-- Rollback (if ever needed):
--   DROP INDEX "session_completion_clientKey_key";
--   ALTER TABLE "session_completion" DROP COLUMN "clientKey";
ALTER TABLE "session_completion" ADD COLUMN "clientKey" TEXT;

CREATE UNIQUE INDEX "session_completion_clientKey_key" ON "session_completion"("clientKey");
