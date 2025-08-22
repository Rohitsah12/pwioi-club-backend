/*
  Warnings:

  - You are about to drop the column `storage_url` on the `PostMedia` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."PostMedia" DROP COLUMN "storage_url",
ADD COLUMN     "s3_key" TEXT NOT NULL DEFAULT '';
