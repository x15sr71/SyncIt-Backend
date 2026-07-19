-- AlterTable
ALTER TABLE "PlaylistMigration" ADD COLUMN     "failedTracks" JSONB NOT NULL DEFAULT '[]';
