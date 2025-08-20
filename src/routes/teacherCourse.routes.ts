import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { getExamsAndPassStatsByType, getExamStudentResults, getTeacherActiveSubjects } from "../controllers/teacherCourse.controller.js";

const teacherCourseRoutes=Router();

teacherCourseRoutes.get("/active-subject",authenticateJwt,requireRoles("TEACHER","ASSISTANT_TEACHER"),getTeacherActiveSubjects)
teacherCourseRoutes.get("/exam-type/average-marks",authenticateJwt,getExamsAndPassStatsByType)
teacherCourseRoutes.get("/exam-student-result",authenticateJwt,getExamStudentResults)

export default teacherCourseRoutes