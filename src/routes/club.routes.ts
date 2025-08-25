import { Router } from 'express';
import {
  createClub,
  getAllClubs,
  getClubsByCenter,
  getClubById,
  updateClub,
  deleteClub
} from '../controllers/club.controller.js';
import { authenticateJwt, requireRoles } from '../middlewares/authMiddleware.js';

const clubRoutes = Router();

clubRoutes.post('/', authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),createClub);
clubRoutes.get('/', authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"), getAllClubs);

clubRoutes.get('/center/:centerId',  authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),getClubsByCenter);

clubRoutes.get('/:clubId', authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"), getClubById);
clubRoutes.patch('/:clubId', authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"), updateClub);
clubRoutes.delete('/:clubId', authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"), deleteClub);

export default clubRoutes;
