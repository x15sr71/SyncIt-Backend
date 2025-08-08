/*
  Warnings:

  - A unique constraint covering the columns `[userId,playlistId,sourcePlatform,destinationPlatform]` on the table `PlaylistMigration` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistMigration_userId_playlistId_sourcePlatform_destinat_key" ON "PlaylistMigration"("userId", "playlistId", "sourcePlatform", "destinationPlatform");
