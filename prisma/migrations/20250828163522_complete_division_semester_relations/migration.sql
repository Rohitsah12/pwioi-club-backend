-- AddForeignKey
ALTER TABLE "public"."Semester" ADD CONSTRAINT "Semester_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
