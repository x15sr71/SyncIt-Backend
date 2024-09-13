/*
  Warnings:

  - You are about to drop the column `last_playlist_hash` on the `SpotifyData` table. All the data in the column will be lost.
  - You are about to drop the column `last_playlist_hash` on the `YouTubeData` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SpotifyData" DROP COLUMN "last_playlist_hash",
ADD COLUMN     "last_TrackIds" TEXT,
ADD COLUMN     "last_playlistTrackIds_hash" TEXT;

-- AlterTable
ALTER TABLE "YouTubeData" DROP COLUMN "last_playlist_hash",
ADD COLUMN     "last_TracksIds" TEXT,
ADD COLUMN     "last_playlistTrackIds_hash" TEXT;
