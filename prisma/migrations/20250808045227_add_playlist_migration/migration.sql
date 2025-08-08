-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';

-- CreateTable
CREATE TABLE "PlaylistMigration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "destinationPlatform" TEXT NOT NULL,
    "sourceTrackIds" TEXT[],
    "migrationCounter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistMigration_pkey" PRIMARY KEY ("id")
);
