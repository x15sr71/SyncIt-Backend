/*
  Warnings:

  - You are about to drop the column `token` on the `SpotifyData` table. All the data in the column will be lost.
  - You are about to drop the column `token` on the `YouTubeData` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SpotifyData" DROP COLUMN "token";

-- AlterTable
ALTER TABLE "YouTubeData" DROP COLUMN "token";
