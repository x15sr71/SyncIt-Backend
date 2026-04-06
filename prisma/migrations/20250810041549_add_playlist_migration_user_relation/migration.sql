-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';
