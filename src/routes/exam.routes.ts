import { Router } from "express";
import multer from 'multer';
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createExam, deleteExam, getAllExamByExamType, getAllExamsBySubject, updateExam, uploadExamMarks } from "../controllers/exam.controller.js";
const examRoutes=Router();
const upload = multer({ storage: multer.memoryStorage() });


examRoutes.post("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","OPS","BATCHOPS"),createExam)
examRoutes.patch("/:examId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","OPS","BATCHOPS"),updateExam)
examRoutes.delete("/:examId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","OPS","BATCHOPS"),deleteExam)

examRoutes.post('/:examId/upload',authenticateJwt,requireRoles("TEACHER","BATCHOPS","ADMIN","SUPER_ADMIN","OPS"),upload.single('marksFile'), uploadExamMarks);
examRoutes.get('/subject/:subjectId', authenticateJwt, getAllExamsBySubject);
examRoutes.get('/:subjectId',authenticateJwt,getAllExamByExamType)
export default examRoutes;