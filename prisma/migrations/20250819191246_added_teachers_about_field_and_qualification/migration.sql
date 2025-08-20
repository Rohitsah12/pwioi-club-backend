-- AlterTable
ALTER TABLE "public"."Teacher" ADD COLUMN     "about" TEXT;

-- CreateTable
CREATE TABLE "public"."TeacherAcademicHistory" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" TEXT NOT NULL,
    "x_education" TEXT,          
    "xii_education" TEXT,
    "undergraduate" TEXT,
    "postgraduate" TEXT,
    "doctorate" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherAcademicHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAcademicHistory_teacher_id_key" ON "public"."TeacherAcademicHistory"("teacher_id");

-- CreateIndex
CREATE INDEX "teacher_academic_history_x_edu_idx" ON "public"."TeacherAcademicHistory"("x_education");

-- CreateIndex
CREATE INDEX "teacher_academic_history_xii_edu_idx" ON "public"."TeacherAcademicHistory"("xii_education");

-- CreateIndex
CREATE INDEX "teacher_academic_history_ug_edu_idx" ON "public"."TeacherAcademicHistory"("undergraduate");

-- CreateIndex
CREATE INDEX "teacher_academic_history_pg_edu_idx" ON "public"."TeacherAcademicHistory"("postgraduate");

-- CreateIndex
CREATE INDEX "teacher_academic_history_doc_edu_idx" ON "public"."TeacherAcademicHistory"("doctorate");

-- AddForeignKey
ALTER TABLE "public"."TeacherAcademicHistory" ADD CONSTRAINT "TeacherAcademicHistory_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeacherAcademicHistory" ADD CONSTRAINT "TeacherAcademicHistory_x_education_fkey" FOREIGN KEY ("x_education") REFERENCES "public"."Education"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeacherAcademicHistory" ADD CONSTRAINT "TeacherAcademicHistory_xii_education_fkey" FOREIGN KEY ("xii_education") REFERENCES "public"."Education"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeacherAcademicHistory" ADD CONSTRAINT "TeacherAcademicHistory_undergraduate_fkey" FOREIGN KEY ("undergraduate") REFERENCES "public"."Education"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeacherAcademicHistory" ADD CONSTRAINT "TeacherAcademicHistory_postgraduate_fkey" FOREIGN KEY ("postgraduate") REFERENCES "public"."Education"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeacherAcademicHistory" ADD CONSTRAINT "TeacherAcademicHistory_doctorate_fkey" FOREIGN KEY ("doctorate") REFERENCES "public"."Education"("id") ON DELETE CASCADE ON UPDATE CASCADE;
