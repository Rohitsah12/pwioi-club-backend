import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { 
    createAdmin, 
    getAllAdmin, 
    getAdminById, 
    updateAdmin, 
    deleteAdmin 
} from "../controllers/admin.controller.js";
import { getAttendanceAnalyticsAdmin } from "../controllers/adminAttendance.controller.js";

const adminRouter = Router();

adminRouter.get('/attendance-analytics',authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),getAttendanceAnalyticsAdmin)

adminRouter.post('/create', authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),createAdmin);


adminRouter.get('/all',authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),getAllAdmin);


adminRouter.get('/:adminId',authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),getAdminById);


adminRouter.put('/:adminId',authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),updateAdmin);


adminRouter.delete('/:adminId',authenticateJwt,requireRoles('SUPER_ADMIN', 'ADMIN', 'BATCHOPS', 'OPS'),deleteAdmin);


export default adminRouter;
