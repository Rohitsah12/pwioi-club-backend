/*
  Warnings:

  - Added the required column `center_id` to the `Club` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Club" ADD COLUMN     "center_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Club" ADD CONSTRAINT "Club_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;
