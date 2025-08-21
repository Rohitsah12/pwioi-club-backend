/*
  Warnings:

  - Added the required column `googleEventId` to the `Class` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Class" ADD COLUMN     "googleEventId" TEXT NOT NULL;
