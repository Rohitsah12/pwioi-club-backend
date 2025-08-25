-- CreateEnum
CREATE TYPE "public"."CPRStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "public"."Class" ADD COLUMN     "sub_topic_id" TEXT;

-- CreateTable
CREATE TABLE "public"."CprModule" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "subject_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CprModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CprTopic" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "module_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CprTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CprSubTopic" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "topic_id" TEXT NOT NULL,
    "lecture_count" INTEGER NOT NULL DEFAULT 1,
    "status" "public"."CPRStatus" NOT NULL DEFAULT 'PENDING',
    "planned_start_date" TIMESTAMP(3),
    "planned_end_date" TIMESTAMP(3),
    "actual_start_date" TIMESTAMP(3),
    "actual_end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CprSubTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CprModule_subject_id_idx" ON "public"."CprModule"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "CprModule_subject_id_order_key" ON "public"."CprModule"("subject_id", "order");

-- CreateIndex
CREATE INDEX "CprTopic_module_id_idx" ON "public"."CprTopic"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "CprTopic_module_id_order_key" ON "public"."CprTopic"("module_id", "order");

-- CreateIndex
CREATE INDEX "CprSubTopic_topic_id_idx" ON "public"."CprSubTopic"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "CprSubTopic_topic_id_order_key" ON "public"."CprSubTopic"("topic_id", "order");

-- AddForeignKey
ALTER TABLE "public"."Class" ADD CONSTRAINT "Class_sub_topic_id_fkey" FOREIGN KEY ("sub_topic_id") REFERENCES "public"."CprSubTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CprModule" ADD CONSTRAINT "CprModule_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CprTopic" ADD CONSTRAINT "CprTopic_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."CprModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CprSubTopic" ADD CONSTRAINT "CprSubTopic_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."CprTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
