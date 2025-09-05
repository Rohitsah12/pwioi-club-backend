import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { getExamsAndPassStatsByType, getExamStudentResults, getTeacherActiveSubjects, getTeachersCompletedSubject } from "../controllers/teacherCourse.controller.js";

const teacherCourseRoutes=Router();

teacherCourseRoutes.get("/active-subject",authenticateJwt,requireRoles("TEACHER","ASSISTANT_TEACHER"),getTeacherActiveSubjects)
teacherCourseRoutes.get("/completedSubject",authenticateJwt,requireRoles("TEACHER","SUPER_ADMIN"),getTeachersCompletedSubject)
teacherCourseRoutes.get("/exam-type/average-marks/:subjectId",authenticateJwt,getExamsAndPassStatsByType)
teacherCourseRoutes.get("/exam-student-result/:examId",authenticateJwt,getExamStudentResults)

export default teacherCourseRoutes