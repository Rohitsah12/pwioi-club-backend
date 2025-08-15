import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createAdmin, getAllAdmin } from "../controllers/admin.controller.js";

const adminRouter=Router()

adminRouter.post('/create',authenticateJwt,requireRoles('SUPER_ADMIN'),createAdmin)
adminRouter.get('/all',authenticateJwt,requireRoles("SUPER_ADMIN"),getAllAdmin)
export default adminRouter;