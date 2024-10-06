-- AlterTable
ALTER TABLE "SpotifyData" ADD COLUMN     "notFoundTrackIds" TEXT,
ADD COLUMN     "retryToFindTracksIds" TEXT;

-- AlterTable
ALTER TABLE "YouTubeData" ADD COLUMN     "notFoundTrackIds" TEXT,
ADD COLUMN     "retryToFindTracksIds" TEXT;
