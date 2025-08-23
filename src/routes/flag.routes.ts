import { Router } from 'express';
import { authenticateJwt, requireRoles } from '../middlewares/authMiddleware.js';
import {
  flagPost,
  getFlags,
  reviewFlag
} from '../controllers/flag.controller.js';

const flagRoutes = Router();

flagRoutes.post('/', authenticateJwt, flagPost);
flagRoutes.get('/', authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"), getFlags);
flagRoutes.patch('/:flagId/review', authenticateJwt, requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),reviewFlag);

export default flagRoutes;
