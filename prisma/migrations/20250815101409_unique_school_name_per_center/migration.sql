/*
  Warnings:

  - A unique constraint covering the columns `[center_id,name]` on the table `School` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."School_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "unique_school_name_per_center" ON "public"."School"("center_id", "name");
