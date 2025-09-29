/*
  Warnings:

  - You are about to drop the column `destinationPlaylistId` on the `PlaylistMigration` table. All the data in the column will be lost.
  - You are about to drop the column `sourcePlaylistId` on the `PlaylistMigration` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,playlistId,sourcePlatform,destinationPlatform]` on the table `PlaylistMigration` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `playlistId` to the `PlaylistMigration` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "PlaylistMigration_userId_sourcePlaylistId_sourcePlatform_de_key";

-- AlterTable
ALTER TABLE "PlaylistMigration" DROP COLUMN "destinationPlaylistId",
DROP COLUMN "sourcePlaylistId",
ADD COLUMN     "playlistId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistMigration_userId_playlistId_sourcePlatform_destinat_key" ON "PlaylistMigration"("userId", "playlistId", "sourcePlatform", "destinationPlatform");
