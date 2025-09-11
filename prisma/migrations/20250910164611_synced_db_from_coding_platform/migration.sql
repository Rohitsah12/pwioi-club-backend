/*
  Warnings:

  - You are about to drop the column `points` on the `contest_problem` table. All the data in the column will be lost.
  - You are about to drop the `submission_status` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "public"."contest" ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subject_id" TEXT;

-- AlterTable
ALTER TABLE "public"."contest_problem" DROP COLUMN "points",
ADD COLUMN     "point" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "public"."submission" ADD COLUMN     "score" DOUBLE PRECISION DEFAULT 0;

-- DropTable
DROP TABLE "public"."submission_status";

-- AddForeignKey
ALTER TABLE "public"."contest" ADD CONSTRAINT "contest_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
