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

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS") ,upload.single('studentsFile'), createCohort);
router.get('/', getAllCohorts);

router.get('/center/:centerId',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS") , getCohortsByCenter);

router.get('/:cohortId',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS") , getCohortById);
router.patch('/:cohortId',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS") , updateCohort);
router.delete('/:cohortId', authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS") ,deleteCohort);

export default router;
