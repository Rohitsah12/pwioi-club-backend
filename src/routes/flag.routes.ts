import { Router } from 'express';
import { authenticateJwt, requireRoles } from '../middlewares/authMiddleware.js';
import {
  flagPost,
  getFlags,
  reviewFlag
} from '../controllers/flag.controller.js';

const flagRoutes = Router();

flagRoutes.post('/', authenticateJwt, flagPost);
flagRoutes.get('/', authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"), getFlags);
flagRoutes.patch('/:flagId/review', authenticateJwt, requireRoles("ADMIN","SUPER_ADMIN"),reviewFlag);

export default flagRoutes;
