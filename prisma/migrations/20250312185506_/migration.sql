/*
  Warnings:

  - A unique constraint covering the columns `[spotify_user_id]` on the table `SpotifyData` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `spotify_user_id` to the `SpotifyData` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SpotifyData" ADD COLUMN     "spotify_user_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';

-- CreateIndex
CREATE UNIQUE INDEX "SpotifyData_spotify_user_id_key" ON "SpotifyData"("spotify_user_id");
