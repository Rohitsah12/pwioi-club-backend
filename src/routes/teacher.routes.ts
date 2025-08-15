import express from "express";
import multer from "multer";
import { authenticateJwt,requireRoles } from "../middlewares/authMiddleware.js";
import {
  bulkCreateTeachers,
  createTeachersFromExcel,
  permanentlyDeleteTeacher,
} from "../controllers/teacher.controller.js";

const teacherRoutes = express.Router();
const upload = multer(); 

teacherRoutes.post("/bulk",authenticateJwt,requireRoles("ADMIN", "SUPER_ADMIN"),bulkCreateTeachers);

teacherRoutes.post("/upload",authenticateJwt,requireRoles("ADMIN", "SUPER_ADMIN"),upload.single("file"),createTeachersFromExcel);

teacherRoutes.delete("/:teacherId",authenticateJwt,requireRoles("ADMIN", "SUPER_ADMIN"),permanentlyDeleteTeacher);

export default teacherRoutes;
