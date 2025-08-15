/*
  Warnings:

  - Added the required column `center_id` to the `Division` table without a default value. This is not possible if the table is not empty.
  - Added the required column `school_id` to the `Division` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Division" ADD COLUMN     "center_id" TEXT NOT NULL,
ADD COLUMN     "school_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "division_center_id_idx" ON "public"."Division"("center_id");

-- CreateIndex
CREATE INDEX "division_school_id_idx" ON "public"."Division"("school_id");

-- AddForeignKey
ALTER TABLE "public"."Division" ADD CONSTRAINT "Division_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Division" ADD CONSTRAINT "Division_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
