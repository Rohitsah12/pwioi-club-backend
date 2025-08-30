import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { getCurrentSemesterDetails, getExamType, getleaderboardDivisionWise, getOverallLeaderboard,  getPastSemestersDetails,  getStudentPerformanceTrends } from "../controllers/studentAcademics.controller.js";

const studentAcademicsRoutes=Router();


studentAcademicsRoutes.get("/performance/trends",authenticateJwt,requireRoles("STUDENT"),getStudentPerformanceTrends)
studentAcademicsRoutes.get("/leaderboard/division",authenticateJwt,requireRoles("STUDENT"),getleaderboardDivisionWise)
studentAcademicsRoutes.get("/leaderboard/overall",authenticateJwt,requireRoles("STUDENT"),getOverallLeaderboard)
studentAcademicsRoutes.get("/academics/current-semester",authenticateJwt,requireRoles("STUDENT"),getCurrentSemesterDetails)
studentAcademicsRoutes.get("/academics/past-semesters",authenticateJwt,requireRoles("STUDENT"),getPastSemestersDetails)
studentAcademicsRoutes.get('/exams/subject/:subjectId/past-exam-types',authenticateJwt,requireRoles("STUDENT"),getExamType)


export default studentAcademicsRoutes