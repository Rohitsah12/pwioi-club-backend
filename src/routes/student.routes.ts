import express from "express";
import multer from "multer"; 
import { authenticateJwt } from "../middlewares/authMiddleware.js";
import { requireRoles } from "../middlewares/authMiddleware.js";
import {
  bulkCreateStudents,
  createStudentsFromExcel,
  permanentlyDeleteStudent,
  softDeleteStudent
} from "../controllers/student.controller.js";

const upload = multer(); 

const studentRoutes = express.Router();

studentRoutes.post("/bulk",authenticateJwt,requireRoles("ADMIN", "SUPER_ADMIN"),bulkCreateStudents);

studentRoutes.post("/bulk-excel",authenticateJwt,requireRoles("ADMIN", "SUPER_ADMIN"),upload.single("file"),createStudentsFromExcel);

studentRoutes.patch("/:studentId/deactivate",authenticateJwt,requireRoles("ADMIN", "SUPER_ADMIN"),softDeleteStudent);

studentRoutes.delete("/:studentId/permanent",authenticateJwt,requireRoles("SUPER_ADMIN"),permanentlyDeleteStudent);


export default studentRoutes;
