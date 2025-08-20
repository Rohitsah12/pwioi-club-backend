import express from "express";
import multer from "multer";
import { authenticateJwt,requireRoles } from "../middlewares/authMiddleware.js";
import {
  addBasicDetailsOfTeacher,
  addTeacherExperience,
  addTeacherResearchPapers,
  bulkCreateTeachers,
  createTeachersFromExcel,
  deleteTeacherExperience,
  deleteTeacherResearhPaper,
  getActiveSubjectAttendance,
  getAssistantTeachers,
  getCenterBatches,
  getTeacherAllExperience,
  getTeacherAllResearchPapers,
  getTeacherById,
  getTeacherExperienceById,
  getTeacherResearchPaperById,
  getTeachersByCenterId,
  getTeachersBySchoolId,
  permanentlyDeleteTeacher,
  updateTeacherExperience,
  updateTeacherResearchPaper,
} from "../controllers/teacher.controller.js";

const teacherRoutes = express.Router();
const upload = multer(); 

// Bulk operations - should come first
teacherRoutes.post("/bulk", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), bulkCreateTeachers);
teacherRoutes.post("/upload", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), upload.single("file"), createTeachersFromExcel);

// Profile routes - should come before parameterized routes
teacherRoutes.patch("/profile/basic-details", authenticateJwt, requireRoles("TEACHER","ASSISTANT_TEACHER"), addBasicDetailsOfTeacher);

// Experience routes
teacherRoutes.post("/profile/experiences", authenticateJwt, requireRoles("TEACHER","ASSISTANT_TEACHER"), addTeacherExperience);
teacherRoutes.get("/profile/experiences", authenticateJwt, getTeacherAllExperience);
teacherRoutes.get("/profile/experiences/:experienceId", authenticateJwt, getTeacherExperienceById);
teacherRoutes.patch("/profile/experiences/:experienceId", authenticateJwt, requireRoles("TEACHER","ASSISTANT_TEACHER"), updateTeacherExperience);
teacherRoutes.delete("/profile/experiences/:experienceId", authenticateJwt, requireRoles("TEACHER","ASSISTANT_TEACHER"), deleteTeacherExperience);

// Research paper routes
teacherRoutes.post("/profile/research-papers", authenticateJwt, requireRoles("TEACHER","ASSISTANT_TEACHER"), addTeacherResearchPapers);
teacherRoutes.get("/profile/research-papers", authenticateJwt, getTeacherAllResearchPapers);
teacherRoutes.get("/profile/research-papers/:researchPaperId", authenticateJwt, getTeacherResearchPaperById);
teacherRoutes.patch("/profile/research-papers/:researchPaperId", authenticateJwt, requireRoles("TEACHER","ASSISTANT_TEACHER"), updateTeacherResearchPaper);
teacherRoutes.delete("/profile/research-papers/:researchPaperId", authenticateJwt, requireRoles("TEACHER","ASSISTANT_TEACHER"), deleteTeacherResearhPaper);

// Special routes - should come before parameterized routes
teacherRoutes.get("/me/active-subject-attendance", authenticateJwt, requireRoles("TEACHER"), getActiveSubjectAttendance);
teacherRoutes.get("/assistant-teachers", authenticateJwt, getAssistantTeachers);
teacherRoutes.get("/batches", authenticateJwt, getCenterBatches);

// Parameterized routes - should come last
teacherRoutes.get("/center/:centerId", authenticateJwt, requireRoles("ADMIN","SUPER_ADMIN"), getTeachersByCenterId);
teacherRoutes.get("/school/:schoolId", authenticateJwt, requireRoles("ADMIN","SUPER_ADMIN"), getTeachersBySchoolId);
teacherRoutes.get("/:teacherId", authenticateJwt, getTeacherById);
teacherRoutes.delete("/:teacherId", authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN"), permanentlyDeleteTeacher);

export default teacherRoutes;