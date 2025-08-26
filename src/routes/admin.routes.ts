import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { 
    createAdmin, 
    getAllAdmin, 
    getAdminById, 
    updateAdmin, 
    deleteAdmin 
} from "../controllers/admin.controller.js";

const adminRouter = Router();



adminRouter.post('/create', authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),createAdmin);

adminRouter.get('/all',authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),getAllAdmin);


adminRouter.get('/:adminId',authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),getAdminById);


adminRouter.put('/:adminId',authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),updateAdmin);


adminRouter.delete('/:adminId',authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),deleteAdmin);

export default adminRouter;