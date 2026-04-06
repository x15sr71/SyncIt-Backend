-- AlterTable
ALTER TABLE "PlaylistMigration" ADD COLUMN     "destinationPlaylistId" TEXT,
ADD COLUMN     "destinationPlaylistName" TEXT;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';
