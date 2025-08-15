/*
  Warnings:

  - A unique constraint covering the columns `[role]` on the table `RoleAdmin` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "RoleAdmin_role_key" ON "public"."RoleAdmin"("role");
