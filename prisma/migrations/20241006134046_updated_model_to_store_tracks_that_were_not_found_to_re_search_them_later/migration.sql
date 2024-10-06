/*
  Warnings:

  - You are about to drop the column `notFoundTrackIds` on the `SpotifyData` table. All the data in the column will be lost.
  - You are about to drop the column `retryToFindTracksIds` on the `SpotifyData` table. All the data in the column will be lost.
  - You are about to drop the column `notFoundTrackIds` on the `YouTubeData` table. All the data in the column will be lost.
  - You are about to drop the column `retryToFindTracksIds` on the `YouTubeData` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SpotifyData" DROP COLUMN "notFoundTrackIds",
DROP COLUMN "retryToFindTracksIds",
ADD COLUMN     "notFoundTracks" TEXT,
ADD COLUMN     "retryToFindTracks" TEXT;

-- AlterTable
ALTER TABLE "YouTubeData" DROP COLUMN "notFoundTrackIds",
DROP COLUMN "retryToFindTracksIds",
ADD COLUMN     "notFoundTracks" TEXT,
ADD COLUMN     "retryToFindTracks" TEXT;
