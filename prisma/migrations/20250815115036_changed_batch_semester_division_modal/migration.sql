/*
  Warnings:

  - You are about to drop the column `current_semester` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `end_date` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `batch_id` on the `Semester` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[current_semester]` on the table `Division` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `start_date` to the `Division` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Batch" DROP CONSTRAINT "Batch_current_semester_fkey";

-- DropForeignKey
ALTER TABLE "public"."Semester" DROP CONSTRAINT "Semester_batch_id_fkey";

-- DropIndex
DROP INDEX "public"."batch_semester_id_idx";

-- DropIndex
DROP INDEX "public"."semester_batch_id_idx";

-- AlterTable
ALTER TABLE "public"."Batch" DROP COLUMN "current_semester",
DROP COLUMN "end_date",
DROP COLUMN "start_date";

-- AlterTable
ALTER TABLE "public"."Division" ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "start_date" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Semester" DROP COLUMN "batch_id",
ADD COLUMN     "division_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Division_current_semester_key" ON "public"."Division"("current_semester");

-- CreateIndex
CREATE INDEX "semester_division_id_idx" ON "public"."Semester"("division_id");
