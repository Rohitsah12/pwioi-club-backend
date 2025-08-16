/*
  Warnings:

  - Added the required column `lecture_number` to the `Class` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Class" ADD COLUMN     "lecture_number" TEXT NOT NULL;
