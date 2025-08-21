// src/routes/class.routes.ts

import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createWeeklySchedule, getClasses, getClass, updateClass, deleteClass } from "../controllers/class.controller.js";

const classRoutes = Router();

classRoutes.post("/schedule", authenticateJwt, requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"), createWeeklySchedule);
classRoutes.get("/", authenticateJwt, requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"), getClasses);
classRoutes.get("/:classId", authenticateJwt, requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"), getClass);
classRoutes.patch("/:classId", authenticateJwt, requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"), updateClass);
classRoutes.delete("/:classId", authenticateJwt, requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"), deleteClass);

export default classRoutes;
