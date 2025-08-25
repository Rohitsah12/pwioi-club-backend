import { Router } from 'express';
import multer from 'multer';
import {
  createCohort,
  getAllCohorts,
  getCohortById,
  getCohortsByCenter,
  updateCohort,
  deleteCohort
} from '../controllers/cohort.controller.js';
import { authenticateJwt, requireRoles } from '../middlewares/authMiddleware.js';

const cohortRoutes = Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

cohortRoutes.post('/',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS") ,upload.single('studentsFile'), createCohort);
cohortRoutes.get('/', getAllCohorts);

cohortRoutes.get('/center/:centerId',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS") , getCohortsByCenter);

cohortRoutes.get('/:cohortId',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS") , getCohortById);
cohortRoutes.patch('/:cohortId',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS") , updateCohort);
cohortRoutes.delete('/:cohortId', authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS") ,deleteCohort);

export default cohortRoutes;
