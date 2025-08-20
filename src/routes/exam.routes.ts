import { Router } from "express";
import multer from 'multer';
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { uploadExamMarks } from "../controllers/exam.controller.js";
const examRoutes=Router();
const upload = multer({ storage: multer.memoryStorage() });


examRoutes.post('/:examId/upload',authenticateJwt,requireRoles("TEACHER"),upload.single('marksFile'), uploadExamMarks);
export default examRoutes;