-- DropIndex
DROP INDEX "SpotifyData_spotify_user_id_key";

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';
