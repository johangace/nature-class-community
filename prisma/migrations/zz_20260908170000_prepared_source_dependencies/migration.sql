CREATE TABLE "prepared_source_dependency" (
  "preparedId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "source" JSONB NOT NULL,
  "valueRevision" TEXT NOT NULL,
  CONSTRAINT "prepared_source_dependency_pkey" PRIMARY KEY ("preparedId", "address"),
  CONSTRAINT "prepared_source_dependency_preparedId_fkey" FOREIGN KEY ("preparedId") REFERENCES "prepared_lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "prepared_source_dependency_address_valueRevision_idx" ON "prepared_source_dependency"("address", "valueRevision");
