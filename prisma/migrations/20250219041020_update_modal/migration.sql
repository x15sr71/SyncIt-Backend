/*
  Warnings:

  - You are about to drop the column `access_token` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `correspondingTrackIds` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PrimaryService" AS ENUM ('SPOTIFY', 'YOUTUBE');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "access_token",
DROP COLUMN "correspondingTrackIds",
DROP COLUMN "refresh_token",
ADD COLUMN     "keepInSync" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastSyncTime" TIMESTAMP(3),
ADD COLUMN     "lastSyncTracks" JSONB,
ADD COLUMN     "primaryService" "PrimaryService";
