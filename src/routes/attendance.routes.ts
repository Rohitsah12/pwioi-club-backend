import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { 
    getClassesForTeacher, 
    getStudentsForAttendance, 
    markOrUpdateAttendance 
} from "../controllers/attendance.controller.js";
import { validate } from "../middlewares/validate.js";
import { getStudentsForAttendanceSchema, getTeacherClassesSchema, markAttendanceSchema } from "../schema/attendanceSchema.js";

const attendanceRoutes = Router();

attendanceRoutes.use(authenticateJwt, requireRoles("TEACHER", "ASSISTANT_TEACHER"));

attendanceRoutes.get("/classes", validate(getTeacherClassesSchema), getClassesForTeacher);

attendanceRoutes.get("/students", validate(getStudentsForAttendanceSchema), getStudentsForAttendance);

attendanceRoutes.patch("/", validate(markAttendanceSchema), markOrUpdateAttendance);

export default attendanceRoutes;