import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createSubject, deleteSubject, getAllSubjects, getSubjectById, getSubjectsBySemester, getSubjectsByTeacher, getSubjectStatistics, updateSubject } from "../controllers/subject.controller.js";

const subjectRoutes=Router();


subjectRoutes.post("", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), createSubject);
subjectRoutes.get("", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), getAllSubjects);
subjectRoutes.get("/statistics", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), getSubjectStatistics);
subjectRoutes.get("/:subjectId", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), getSubjectById);
subjectRoutes.patch("/:subjectId", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), updateSubject);
subjectRoutes.delete("/:subjectId", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), deleteSubject);
subjectRoutes.get("/semesters/:semesterId", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), getSubjectsBySemester);
subjectRoutes.get("/teachers/:teacherId", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), getSubjectsByTeacher);


export default subjectRoutes;