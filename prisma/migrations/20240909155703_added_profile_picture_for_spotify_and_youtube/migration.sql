/*
  Warnings:

  - Added the required column `picture` to the `SpotifyData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `SpotifyData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `picture` to the `YouTubeData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `YouTubeData` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SpotifyData" ADD COLUMN     "picture" TEXT NOT NULL,
ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "YouTubeData" ADD COLUMN     "picture" TEXT NOT NULL,
ADD COLUMN     "userId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "SpotifyData" ADD CONSTRAINT "SpotifyData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouTubeData" ADD CONSTRAINT "YouTubeData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
