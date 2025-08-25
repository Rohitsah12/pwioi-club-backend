/*
  Warnings:

  - A unique constraint covering the columns `[pwId]` on the table `Admin` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[pwId]` on the table `Teacher` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Admin" ADD COLUMN     "pwId" TEXT;

-- AlterTable
ALTER TABLE "public"."Teacher" ADD COLUMN     "pwId" TEXT,
ADD COLUMN     "supervising_teacher_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Admin_pwId_key" ON "public"."Admin"("pwId");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_pwId_key" ON "public"."Teacher"("pwId");

-- CreateIndex
CREATE INDEX "teacher_supervising_teacher_idx" ON "public"."Teacher"("supervising_teacher_id");

-- AddForeignKey
ALTER TABLE "public"."Teacher" ADD CONSTRAINT "Teacher_supervising_teacher_id_fkey" FOREIGN KEY ("supervising_teacher_id") REFERENCES "public"."Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
