/*
  Warnings:

  - You are about to drop the column `email` on the `sessions` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[user_id,session_id]` on the table `sessions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `user_id` to the `sessions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_email_fkey";

-- DropIndex
DROP INDEX "sessions_email_session_id_key";

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "email",
ADD COLUMN     "user_id" TEXT NOT NULL,
ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';

-- CreateIndex
CREATE UNIQUE INDEX "sessions_user_id_session_id_key" ON "sessions"("user_id", "session_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
