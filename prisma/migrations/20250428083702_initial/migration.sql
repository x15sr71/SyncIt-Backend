/*
  Warnings:

  - A unique constraint covering the columns `[spotify_user_id]` on the table `SpotifyData` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';

-- CreateIndex
CREATE UNIQUE INDEX "SpotifyData_spotify_user_id_key" ON "SpotifyData"("spotify_user_id");
