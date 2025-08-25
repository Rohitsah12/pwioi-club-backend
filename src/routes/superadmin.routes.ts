import { Router } from "express";
import {prisma} from '../db/prisma.js'
import { RoleType } from "@prisma/client";
import { createSuperAdmin, getAllAdmin, getAllSuperAdmin } from "../controllers/superadmin.controller.js";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";

const superadminrouter=Router();

superadminrouter.post('/create',authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),createSuperAdmin)
superadminrouter.get('/all',authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),getAllSuperAdmin)


superadminrouter.get("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","OPS","BATCHOPS"),getAllAdmin)

export default superadminrouter;