/*
  Warnings:

  - You are about to drop the `AllowedLanguage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BatchContest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Contest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ContestModerator` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ContestProblem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Problem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProblemModerator` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProblemTag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProgrammingLanguage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Submission` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SubmissionResult` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SubmissionStatus` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Tag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TestCase` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."AllowedLanguage" DROP CONSTRAINT "AllowedLanguage_contest_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."AllowedLanguage" DROP CONSTRAINT "AllowedLanguage_language_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."BatchContest" DROP CONSTRAINT "BatchContest_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."BatchContest" DROP CONSTRAINT "BatchContest_contest_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Contest" DROP CONSTRAINT "Contest_created_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."ContestModerator" DROP CONSTRAINT "ContestModerator_contest_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ContestModerator" DROP CONSTRAINT "ContestModerator_moderator_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ContestProblem" DROP CONSTRAINT "ContestProblem_contest_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ContestProblem" DROP CONSTRAINT "ContestProblem_problem_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Problem" DROP CONSTRAINT "Problem_created_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProblemModerator" DROP CONSTRAINT "ProblemModerator_moderator_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProblemModerator" DROP CONSTRAINT "ProblemModerator_problem_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProblemTag" DROP CONSTRAINT "ProblemTag_problem_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProblemTag" DROP CONSTRAINT "ProblemTag_tag_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Submission" DROP CONSTRAINT "Submission_contest_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Submission" DROP CONSTRAINT "Submission_language_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Submission" DROP CONSTRAINT "Submission_problem_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Submission" DROP CONSTRAINT "Submission_status_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Submission" DROP CONSTRAINT "Submission_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."SubmissionResult" DROP CONSTRAINT "SubmissionResult_status_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."SubmissionResult" DROP CONSTRAINT "SubmissionResult_submission_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."SubmissionResult" DROP CONSTRAINT "SubmissionResult_test_case_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."TestCase" DROP CONSTRAINT "TestCase_problem_id_fkey";

-- DropTable
DROP TABLE "public"."AllowedLanguage";

-- DropTable
DROP TABLE "public"."BatchContest";

-- DropTable
DROP TABLE "public"."Contest";

-- DropTable
DROP TABLE "public"."ContestModerator";

-- DropTable
DROP TABLE "public"."ContestProblem";

-- DropTable
DROP TABLE "public"."Problem";

-- DropTable
DROP TABLE "public"."ProblemModerator";

-- DropTable
DROP TABLE "public"."ProblemTag";

-- DropTable
DROP TABLE "public"."ProgrammingLanguage";

-- DropTable
DROP TABLE "public"."Submission";

-- DropTable
DROP TABLE "public"."SubmissionResult";

-- DropTable
DROP TABLE "public"."SubmissionStatus";

-- DropTable
DROP TABLE "public"."Tag";

-- DropTable
DROP TABLE "public"."TestCase";

-- CreateTable
CREATE TABLE "public"."problem" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "problem_statement" TEXT NOT NULL DEFAULT '',
    "constraints" TEXT NOT NULL DEFAULT '',
    "difficulty" "public"."Difficulty" NOT NULL DEFAULT 'Easy',
    "created_by" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "problemWeight" INTEGER NOT NULL DEFAULT 30,
    "testcaseWeight" INTEGER NOT NULL DEFAULT 70,

    CONSTRAINT "problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."problem_language" (
    "id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "language_id" TEXT NOT NULL,
    "prelude" TEXT NOT NULL DEFAULT '',
    "boilerplate" TEXT NOT NULL DEFAULT '',
    "driver_code" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."problem_tag" (
    "id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contest_tag" (
    "id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."test_case" (
    "id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "input" VARCHAR(200) NOT NULL,
    "expected_output" VARCHAR(200) NOT NULL,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "explanation" TEXT,

    CONSTRAINT "test_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."problem_moderator" (
    "id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "moderator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_moderator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contest" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."batch_contest" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."programming_language" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "judge0_code" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programming_language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."allowed_language" (
    "id" TEXT NOT NULL,
    "language_id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allowed_language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contest_moderator" (
    "id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "moderator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_moderator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contest_problem" (
    "id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."submission_status" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,

    CONSTRAINT "submission_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."submission" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "contest_id" TEXT,
    "language_id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "execution_time" DOUBLE PRECISION,
    "memory_used" DOUBLE PRECISION,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."submission_result" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "test_case_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "execution_time" DOUBLE PRECISION,
    "memory_used" INTEGER,

    CONSTRAINT "submission_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "problem_created_by_idx" ON "public"."problem"("created_by");

-- CreateIndex
CREATE INDEX "problem_difficulty_idx" ON "public"."problem"("difficulty");

-- CreateIndex
CREATE INDEX "problem_is_active_idx" ON "public"."problem"("is_active");

-- CreateIndex
CREATE INDEX "problem_is_public_idx" ON "public"."problem"("is_public");

-- CreateIndex
CREATE INDEX "problem_title_idx" ON "public"."problem"("title");

-- CreateIndex
CREATE INDEX "problem_language_id_idx" ON "public"."problem_language"("id");

-- CreateIndex
CREATE INDEX "problem_language_problem_id_language_id_idx" ON "public"."problem_language"("problem_id", "language_id");

-- CreateIndex
CREATE UNIQUE INDEX "problem_language_problem_id_language_id_key" ON "public"."problem_language"("problem_id", "language_id");

-- CreateIndex
CREATE INDEX "problem_tag_problem_id_idx" ON "public"."problem_tag"("problem_id");

-- CreateIndex
CREATE INDEX "problem_tag_tag_id_idx" ON "public"."problem_tag"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "problem_tag_problem_id_tag_id_key" ON "public"."problem_tag"("problem_id", "tag_id");

-- CreateIndex
CREATE INDEX "contest_tag_contest_id_idx" ON "public"."contest_tag"("contest_id");

-- CreateIndex
CREATE INDEX "contest_tag_tag_id_idx" ON "public"."contest_tag"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "contest_tag_contest_id_tag_id_key" ON "public"."contest_tag"("contest_id", "tag_id");

-- CreateIndex
CREATE INDEX "test_case_problem_id_idx" ON "public"."test_case"("problem_id");

-- CreateIndex
CREATE INDEX "test_case_is_sample_idx" ON "public"."test_case"("is_sample");

-- CreateIndex
CREATE INDEX "problem_moderator_problem_id_idx" ON "public"."problem_moderator"("problem_id");

-- CreateIndex
CREATE INDEX "problem_moderator_moderator_id_idx" ON "public"."problem_moderator"("moderator_id");

-- CreateIndex
CREATE INDEX "contest_created_by_idx" ON "public"."contest"("created_by");

-- CreateIndex
CREATE INDEX "contest_start_time_idx" ON "public"."contest"("start_time");

-- CreateIndex
CREATE INDEX "contest_end_time_idx" ON "public"."contest"("end_time");

-- CreateIndex
CREATE INDEX "contest_is_open_idx" ON "public"."contest"("is_open");

-- CreateIndex
CREATE INDEX "contest_title_idx" ON "public"."contest"("title");

-- CreateIndex
CREATE INDEX "batch_contest_batch_id_idx" ON "public"."batch_contest"("batch_id");

-- CreateIndex
CREATE INDEX "batch_contest_contest_id_idx" ON "public"."batch_contest"("contest_id");

-- CreateIndex
CREATE UNIQUE INDEX "programming_language_name_key" ON "public"."programming_language"("name");

-- CreateIndex
CREATE UNIQUE INDEX "programming_language_judge0_code_key" ON "public"."programming_language"("judge0_code");

-- CreateIndex
CREATE INDEX "programming_language_name_idx" ON "public"."programming_language"("name");

-- CreateIndex
CREATE INDEX "programming_language_judge0_code_idx" ON "public"."programming_language"("judge0_code");

-- CreateIndex
CREATE INDEX "allowed_language_language_id_idx" ON "public"."allowed_language"("language_id");

-- CreateIndex
CREATE INDEX "allowed_language_contest_id_idx" ON "public"."allowed_language"("contest_id");

-- CreateIndex
CREATE INDEX "contest_moderator_contest_id_idx" ON "public"."contest_moderator"("contest_id");

-- CreateIndex
CREATE INDEX "contest_moderator_moderator_id_idx" ON "public"."contest_moderator"("moderator_id");

-- CreateIndex
CREATE UNIQUE INDEX "contest_moderator_contest_id_moderator_id_key" ON "public"."contest_moderator"("contest_id", "moderator_id");

-- CreateIndex
CREATE INDEX "contest_problem_contest_id_idx" ON "public"."contest_problem"("contest_id");

-- CreateIndex
CREATE INDEX "contest_problem_problem_id_idx" ON "public"."contest_problem"("problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "contest_problem_contest_id_problem_id_key" ON "public"."contest_problem"("contest_id", "problem_id");

-- CreateIndex
CREATE INDEX "submission_status_name_idx" ON "public"."submission_status"("name");

-- CreateIndex
CREATE INDEX "submission_student_id_idx" ON "public"."submission"("student_id");

-- CreateIndex
CREATE INDEX "submission_problem_id_idx" ON "public"."submission"("problem_id");

-- CreateIndex
CREATE INDEX "submission_contest_id_idx" ON "public"."submission"("contest_id");

-- CreateIndex
CREATE INDEX "submission_language_id_idx" ON "public"."submission"("language_id");

-- CreateIndex
CREATE INDEX "submission_submitted_at_idx" ON "public"."submission"("submitted_at");

-- CreateIndex
CREATE INDEX "submission_result_submission_id_idx" ON "public"."submission_result"("submission_id");

-- CreateIndex
CREATE INDEX "submission_result_test_case_id_idx" ON "public"."submission_result"("test_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_name_key" ON "public"."tag"("name");

-- CreateIndex
CREATE INDEX "tag_name_idx" ON "public"."tag"("name");

-- AddForeignKey
ALTER TABLE "public"."problem" ADD CONSTRAINT "problem_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."problem_language" ADD CONSTRAINT "problem_language_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."problem_language" ADD CONSTRAINT "problem_language_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."programming_language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."problem_tag" ADD CONSTRAINT "problem_tag_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."problem_tag" ADD CONSTRAINT "problem_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contest_tag" ADD CONSTRAINT "contest_tag_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contest_tag" ADD CONSTRAINT "contest_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."test_case" ADD CONSTRAINT "test_case_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."problem_moderator" ADD CONSTRAINT "problem_moderator_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."problem_moderator" ADD CONSTRAINT "problem_moderator_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "public"."Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contest" ADD CONSTRAINT "contest_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batch_contest" ADD CONSTRAINT "batch_contest_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batch_contest" ADD CONSTRAINT "batch_contest_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allowed_language" ADD CONSTRAINT "allowed_language_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."programming_language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allowed_language" ADD CONSTRAINT "allowed_language_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contest_moderator" ADD CONSTRAINT "contest_moderator_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contest_moderator" ADD CONSTRAINT "contest_moderator_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "public"."Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contest_problem" ADD CONSTRAINT "contest_problem_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contest_problem" ADD CONSTRAINT "contest_problem_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission" ADD CONSTRAINT "submission_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission" ADD CONSTRAINT "submission_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission" ADD CONSTRAINT "submission_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission" ADD CONSTRAINT "submission_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."programming_language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission_result" ADD CONSTRAINT "submission_result_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission_result" ADD CONSTRAINT "submission_result_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
