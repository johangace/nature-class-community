-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearGroup" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teacherId" TEXT NOT NULL,

    CONSTRAINT "class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_completion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "headcount" INTEGER NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "session_completion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "class_teacherId_idx" ON "class"("teacherId");

-- CreateIndex
CREATE INDEX "session_completion_classId_idx" ON "session_completion"("classId");

-- CreateIndex
CREATE INDEX "session_completion_sessionId_idx" ON "session_completion"("sessionId");

-- AddForeignKey
ALTER TABLE "class" ADD CONSTRAINT "class_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_completion" ADD CONSTRAINT "session_completion_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

