import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createSubject, deleteSubject, getAllSubjects, getStudentsForSubject, getSubjectById, getSubjectsBySemester, getSubjectsByTeacher, getSubjectStatistics, updateSubject } from "../controllers/subject.controller.js";

const subjectRoutes=Router();


subjectRoutes.post("", authenticateJwt, requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"), createSubject);
subjectRoutes.get("", authenticateJwt, requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"), getAllSubjects);
subjectRoutes.get("/statistics", authenticateJwt, requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"), getSubjectStatistics);
subjectRoutes.get("/:subjectId", authenticateJwt, requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"), getSubjectById);
subjectRoutes.patch("/:subjectId", authenticateJwt, requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"), updateSubject);
subjectRoutes.delete("/:subjectId", authenticateJwt, requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"), deleteSubject);
subjectRoutes.get("/semesters/:semesterId", authenticateJwt, requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"), getSubjectsBySemester);
subjectRoutes.get("/teachers/:teacherId", authenticateJwt, requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"), getSubjectsByTeacher);

subjectRoutes.get('/:subjectId/students',authenticateJwt, requireRoles("TEACHER",), getStudentsForSubject);
export default subjectRoutes;