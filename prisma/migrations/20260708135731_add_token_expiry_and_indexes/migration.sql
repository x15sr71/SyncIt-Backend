-- AlterTable
ALTER TABLE "SpotifyData" ADD COLUMN     "token_expires_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "YouTubeData" ADD COLUMN     "token_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PlaylistMigration_userId_idx" ON "PlaylistMigration"("userId");

-- CreateIndex
CREATE INDEX "PlaylistMigration_userId_sourcePlatform_destinationPlatform_idx" ON "PlaylistMigration"("userId", "sourcePlatform", "destinationPlatform");

-- CreateIndex
CREATE INDEX "SpotifyData_userId_idx" ON "SpotifyData"("userId");

-- CreateIndex
CREATE INDEX "YouTubeData_userId_idx" ON "YouTubeData"("userId");
