/*
  Warnings:

  - You are about to drop the column `user_id` on the `sessions` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email,session_id]` on the table `sessions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `sessions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropIndex
DROP INDEX "sessions_user_id_session_id_key";

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "user_id",
ADD COLUMN     "email" TEXT NOT NULL,
ALTER COLUMN "expires_at" SET DEFAULT NOW() + INTERVAL '1 day';

-- CreateIndex
CREATE UNIQUE INDEX "sessions_email_session_id_key" ON "sessions"("email", "session_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_email_fkey" FOREIGN KEY ("email") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
