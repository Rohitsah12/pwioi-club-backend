/*
  Warnings:

  - Added the required column `school_id` to the `Cohort` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Cohort" ADD COLUMN     "school_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "cohort_school_id_idx" ON "public"."Cohort"("school_id");

-- AddForeignKey
ALTER TABLE "public"."Cohort" ADD CONSTRAINT "Cohort_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
