/*
  Warnings:

  - You are about to drop the column `last_Tracks` on the `SpotifyData` table. All the data in the column will be lost.
  - You are about to drop the column `last_Tracks` on the `YouTubeData` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SpotifyData" DROP COLUMN "last_Tracks";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "correspondingTrackIds" TEXT;

-- AlterTable
ALTER TABLE "YouTubeData" DROP COLUMN "last_Tracks";
