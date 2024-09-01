-- AlterTable
ALTER TABLE "SpotifyData" ADD COLUMN     "last_SyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "profilePicture" DROP NOT NULL,
ALTER COLUMN "access_token" DROP NOT NULL,
ALTER COLUMN "refresh_token" DROP NOT NULL;

-- AlterTable
ALTER TABLE "YouTubeData" ADD COLUMN     "last_SyncedAt" TIMESTAMP(3);
