import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { getTeacherActiveSubjects } from "../controllers/teacherCourse.controller.js";

const teacherCourseRoutes=Router();



teacherCourseRoutes.get("/active-subject",authenticateJwt,requireRoles("TEACHER","ASSISTANT_TEACHER"),getTeacherActiveSubjects)


export default teacherCourseRoutes