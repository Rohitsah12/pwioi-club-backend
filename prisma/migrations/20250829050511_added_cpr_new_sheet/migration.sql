/*
  Warnings:

  - You are about to drop the column `sub_topic_id` on the `Class` table. All the data in the column will be lost.
  - You are about to drop the column `lecture_count` on the `CprSubTopic` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Class" DROP CONSTRAINT "Class_sub_topic_id_fkey";

-- AlterTable
ALTER TABLE "public"."Class" DROP COLUMN "sub_topic_id";

-- AlterTable
ALTER TABLE "public"."CprSubTopic" DROP COLUMN "lecture_count",
ADD COLUMN     "lecture_number" INTEGER NOT NULL DEFAULT 1;
