-- A teacher can finish and keep a reflection without supplying a headcount.
-- Existing numbers retain their meaning; blank is stored as NULL rather than
-- zero, because "not answered" must not become "no children went outside".
ALTER TABLE "session_completion" ALTER COLUMN "headcount" DROP NOT NULL;
