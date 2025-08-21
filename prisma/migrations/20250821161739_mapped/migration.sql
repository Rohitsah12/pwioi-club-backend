/*
  Warnings:

  - Added the required column `center_id` to the `Room` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "center_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "room_center_id_idx" ON "public"."Room"("center_id");

-- AddForeignKey
ALTER TABLE "public"."Room" ADD CONSTRAINT "Room_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;
