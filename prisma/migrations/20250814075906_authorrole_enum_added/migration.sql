/*
  Warnings:

  - Changed the type of `author_type` on the `Post` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."AuthorRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OPS', 'BATCHOPS', 'TEACHER', 'ASSISTANT_TEACHER', 'STUDENT');

-- AlterTable
ALTER TABLE "public"."Post" DROP COLUMN "author_type",
ADD COLUMN     "author_type" "public"."AuthorRole" NOT NULL;
