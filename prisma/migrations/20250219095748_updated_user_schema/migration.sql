/*
  Warnings:

  - The primary key for the `SpotifyData` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `YouTubeData` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "SpotifyData" DROP CONSTRAINT "SpotifyData_userId_fkey";

-- DropForeignKey
ALTER TABLE "YouTubeData" DROP CONSTRAINT "YouTubeData_userId_fkey";

-- AlterTable
ALTER TABLE "SpotifyData" DROP CONSTRAINT "SpotifyData_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "userId" SET DATA TYPE TEXT,
ADD CONSTRAINT "SpotifyData_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "SpotifyData_id_seq";

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "User_id_seq";

-- AlterTable
ALTER TABLE "YouTubeData" DROP CONSTRAINT "YouTubeData_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "userId" SET DATA TYPE TEXT,
ADD CONSTRAINT "YouTubeData_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "YouTubeData_id_seq";

-- AddForeignKey
ALTER TABLE "SpotifyData" ADD CONSTRAINT "SpotifyData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouTubeData" ADD CONSTRAINT "YouTubeData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
