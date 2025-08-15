/*
  Warnings:

  - Made the column `semester_id` on table `Student` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Student" ALTER COLUMN "semester_id" SET NOT NULL;
