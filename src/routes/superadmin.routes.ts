import { Router } from "express";
import {prisma} from '../db/prisma.js'
import { RoleType } from "@prisma/client";
import { createSuperAdmin, getAllSuperAdmin } from "../controllers/superadmin.controller.js";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";

const superadminrouter=Router();

superadminrouter.post('/create',authenticateJwt,requireRoles("SUPER_ADMIN"),createSuperAdmin)
superadminrouter.get('/all',authenticateJwt,requireRoles("SUPER_ADMIN"),getAllSuperAdmin)

export default superadminrouter;