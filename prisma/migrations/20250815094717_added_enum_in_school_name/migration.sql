/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `School` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `name` on the `School` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."SchoolName" AS ENUM ('SOT', 'SOM', 'SOH');

-- AlterTable
ALTER TABLE "public"."School" DROP COLUMN "name",
ADD COLUMN     "name" "public"."SchoolName" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "School_name_key" ON "public"."School"("name");
