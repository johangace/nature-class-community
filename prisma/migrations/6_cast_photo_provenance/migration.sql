-- Exact observation-photo provenance for the stored class cast.
--
-- Additive and nullable: legacy rows remain readable but deliberately render
-- as plates because a bare URL cannot prove role, creator, licence, or source.
ALTER TABLE "cast_member" ADD COLUMN "photoCreator" TEXT;
ALTER TABLE "cast_member" ADD COLUMN "photoRole" TEXT;
ALTER TABLE "cast_member" ADD COLUMN "photoAttribution" TEXT;
ALTER TABLE "cast_member" ADD COLUMN "photoLicense" TEXT;
ALTER TABLE "cast_member" ADD COLUMN "photoSourceUrl" TEXT;
ALTER TABLE "cast_member" ADD COLUMN "photoObservationId" TEXT;

-- Manual rollback, only after code no longer reads these fields:
-- ALTER TABLE "cast_member" DROP COLUMN "photoObservationId";
-- ALTER TABLE "cast_member" DROP COLUMN "photoSourceUrl";
-- ALTER TABLE "cast_member" DROP COLUMN "photoLicense";
-- ALTER TABLE "cast_member" DROP COLUMN "photoAttribution";
-- ALTER TABLE "cast_member" DROP COLUMN "photoRole";
-- ALTER TABLE "cast_member" DROP COLUMN "photoCreator";
