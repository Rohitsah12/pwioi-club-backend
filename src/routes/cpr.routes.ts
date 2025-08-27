import { Router } from 'express';
import multer from 'multer';
import { uploadCprSheet, getCprBySubject, deleteCprBySubject } from '../controllers/cpr.controller.js';
import { updateSubTopicStatus } from '../controllers/teacherCpr.controller.js';
import { authenticateJwt, requireRoles } from '../middlewares/authMiddleware.js';

const cprRoutes = Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


cprRoutes.post('/upload',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","OPS","BATCHOPS"),upload.single('file'),uploadCprSheet);

cprRoutes.get('/subject/:subjectId',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS","TEACHER","ASSISTANT_TEACHER"),getCprBySubject);

cprRoutes.delete('/subject/:subjectId', authenticateJwt, requireRoles("ADMIN", "SUPER_ADMIN", "OPS", "BATCHOPS"), deleteCprBySubject);
cprRoutes.patch('/sub-topics/:subTopicId/status',authenticateJwt,requireRoles("TEACHER","ASSISTANT_TEACHER") ,updateSubTopicStatus);

export default cprRoutes;
