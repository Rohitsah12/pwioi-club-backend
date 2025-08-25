import { Router } from "express";
import { 
    createSuperAdmin, 
    getAllAdmin, 
    getAllSuperAdmin,
    getSuperAdminById,
    updateSuperAdmin,
    deleteSuperAdmin
} from "../controllers/superadmin.controller.js";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";

const superadminrouter = Router();

superadminrouter.post('/create',authenticateJwt,requireRoles('SUPER_ADMIN','ADMIN','BATCHOPS','OPS'),createSuperAdmin);
superadminrouter.get('/all',authenticateJwt,requireRoles('SUPER_ADMIN','ADMIN','BATCHOPS','OPS'),getAllSuperAdmin);
superadminrouter.get('/:superadminId',authenticateJwt,requireRoles('SUPER_ADMIN','ADMIN','BATCHOPS','OPS'),getSuperAdminById);
superadminrouter.put('/:superadminId',authenticateJwt,requireRoles('SUPER_ADMIN','ADMIN','BATCHOPS','OPS'),updateSuperAdmin);
superadminrouter.delete('/:superadminId',authenticateJwt,requireRoles('SUPER_ADMIN','ADMIN','BATCHOPS','OPS'),deleteSuperAdmin);
superadminrouter.get('',authenticateJwt,requireRoles('SUPER_ADMIN','ADMIN','BATCHOPS','OPS'),getAllAdmin);

export default superadminrouter;
