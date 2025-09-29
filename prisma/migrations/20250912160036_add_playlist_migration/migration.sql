/*
  Warnings:

  - You are about to drop the column `playlistId` on the `PlaylistMigration` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,sourcePlaylistId,sourcePlatform,destinationPlatform]` on the table `PlaylistMigration` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sourcePlaylistId` to the `PlaylistMigration` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "PlaylistMigration_userId_playlistId_sourcePlatform_destinat_key";

-- AlterTable
ALTER TABLE "PlaylistMigration" DROP COLUMN "playlistId",
ADD COLUMN     "destinationPlaylistId" TEXT,
ADD COLUMN     "sourcePlaylistId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistMigration_userId_sourcePlaylistId_sourcePlatform_de_key" ON "PlaylistMigration"("userId", "sourcePlaylistId", "sourcePlatform", "destinationPlatform");
