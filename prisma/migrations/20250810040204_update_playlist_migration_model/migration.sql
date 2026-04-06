-- AlterTable
ALTER TABLE "PlaylistMigration" ADD COLUMN     "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncError" TEXT,
ADD COLUMN     "lastSyncStatus" TEXT,
ADD COLUMN     "nextSyncAt" TIMESTAMP(3),
ADD COLUMN     "syncIntervalMinutes" INTEGER;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';
