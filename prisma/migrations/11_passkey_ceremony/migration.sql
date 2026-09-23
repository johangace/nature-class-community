-- Where passkey ceremonies come to be counted (#650). No column here can
-- identify a teacher: coarse device and browser family, the library's error
-- code, and how the ceremony ended.
CREATE TABLE "passkey_ceremony" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "surface" TEXT NOT NULL,
    "act" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "code" TEXT,
    "reason" TEXT,
    "platform" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "canSave" BOOLEAN,
    "conditional" BOOLEAN,

    CONSTRAINT "passkey_ceremony_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "passkey_ceremony_createdAt_idx" ON "passkey_ceremony"("createdAt");
