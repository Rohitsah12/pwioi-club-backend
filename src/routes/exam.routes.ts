import { Router } from "express";
import multer from 'multer';
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { getAllExamByExamType, uploadExamMarks } from "../controllers/exam.controller.js";
const examRoutes=Router();
const upload = multer({ storage: multer.memoryStorage() });


examRoutes.post('/:examId/upload',authenticateJwt,requireRoles("TEACHER"),upload.single('marksFile'), uploadExamMarks);

examRoutes.get('/:subjectId',authenticateJwt,getAllExamByExamType)
export default examRoutes;