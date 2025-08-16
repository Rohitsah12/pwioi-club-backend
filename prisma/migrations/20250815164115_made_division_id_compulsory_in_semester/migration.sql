/*
  Warnings:

  - Made the column `division_id` on table `Semester` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Semester" ALTER COLUMN "division_id" SET NOT NULL;
