-- AlterTable
ALTER TABLE "SpotifyData" ADD COLUMN     "needs_reconnect" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "YouTubeData" ADD COLUMN     "needs_reconnect" BOOLEAN NOT NULL DEFAULT false;
