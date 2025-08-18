import { Router } from "express";
import {
  getOverallSemesterAttendance,
  getSubjectWiseAttendance,
  getSubjectMonthlyAttendance,
  getSubjectWeeklyAttendance,
  getSubjectDailyAttendance
} from "../controllers/studentAttendance.controller.js";
import { authenticateJwt, requireRoles  } from "../middlewares/authMiddleware.js";

const studentAttendanceRoutes = Router();

studentAttendanceRoutes.get(
  "/:studentId/attendance",
  authenticateJwt,
  requireRoles("STUDENT"),
  getOverallSemesterAttendance
);

studentAttendanceRoutes.get(
  "/:studentId/attendance/subject/:subjectId",
  authenticateJwt,
  requireRoles("STUDENT"),
  getSubjectWiseAttendance
);

studentAttendanceRoutes.get(
  "/:studentId/attendance/subject/:subjectId/month/:month",
  authenticateJwt,
  requireRoles("STUDENT"),
  getSubjectMonthlyAttendance
);

studentAttendanceRoutes.get(
  "/:studentId/attendance/subject/:subjectId/week/:week",
  authenticateJwt,
  requireRoles("STUDENT"),
  getSubjectWeeklyAttendance
);

studentAttendanceRoutes.get(
  "/:studentId/attendance/subject/:subjectId/date/:date",
  authenticateJwt,
  requireRoles("STUDENT"),
  getSubjectDailyAttendance
);

export default studentAttendanceRoutes;
