-- AlterTable
ALTER TABLE "public"."Admin" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Student" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Teacher" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);
